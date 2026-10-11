const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.DB_FILE = path.join(os.tmpdir(), `allmodelai-owner-mode-${process.pid}.sqlite`);
process.env.GEMINI_API_KEY = 'owner-mode-gemini';

const app = require('../app');
const originalFetch = global.fetch;

let ownerAgent;
let userAgent;
const ownerEmail = 'owner-mode@example.com';
const userEmail = 'regular-mode@example.com';

before(async () => {
    ownerAgent = request.agent(app);
    userAgent = request.agent(app);
    await ownerAgent.post('/api/auth/register').send({
        name: 'Site Owner',
        email: ownerEmail,
        password: 'owner-mode-password',
    });
    await userAgent.post('/api/auth/register').send({
        name: 'Regular',
        email: userEmail,
        password: 'regular-mode-password',
    });
    app.locals.db.database.prepare('UPDATE users SET role = ? WHERE lower(email) = ?').run('owner', ownerEmail);
});

after(() => {
    global.fetch = originalFetch;
    app.locals.db.close();
});

test('owner receives complimentary Plus and can switch User preview without billing changes', async () => {
    const db = app.locals.db.database;
    const subsBefore = db.prepare('SELECT COUNT(*) AS c FROM subscription_details').get().c;

    const plusCredits = await ownerAgent.get('/api/credits');
    assert.equal(plusCredits.body.isOwner, true);
    assert.equal(plusCredits.body.canManageOwnerMode, true);
    assert.equal(plusCredits.body.canUseDeveloper, true);
    assert.equal(plusCredits.body.plusActive, true);
    assert.deepEqual(plusCredits.body.models, ['all']);

    const preview = await ownerAgent.patch('/api/access-mode').send({ mode: 'user' });
    assert.equal(preview.status, 200);
    assert.equal(preview.body.mode, 'user');
    assert.equal(preview.body.plusActive, false);
    assert.equal(preview.body.ownerPreview, true);
    assert.ok(Array.isArray(preview.body.models));
    assert.equal(preview.body.models.includes('all'), false);

    const restored = await ownerAgent.get('/api/credits');
    assert.equal(restored.body.mode, 'user');

    const backToPlus = await ownerAgent.patch('/api/access-mode').send({ mode: 'developer' });
    assert.equal(backToPlus.status, 200);
    assert.equal(backToPlus.body.plusActive, true);
    assert.deepEqual(backToPlus.body.models, ['all']);

    const subsAfter = db.prepare('SELECT COUNT(*) AS c FROM subscription_details').get().c;
    assert.equal(subsAfter, subsBefore);
});

test('regular users cannot enable Plus through access-mode API', async () => {
    const attempt = await userAgent.patch('/api/access-mode').send({ mode: 'developer' });
    assert.equal(attempt.status, 403);
    const credits = await userAgent.get('/api/credits');
    assert.equal(credits.body.isOwner, false);
    assert.equal(credits.body.canManageOwnerMode, false);
    assert.equal(credits.body.canUseDeveloper, false);
});

test('owner User preview enforces premium model gate on chat', async () => {
    await ownerAgent.patch('/api/access-mode').send({ mode: 'user' });
    global.fetch = () => {
        throw new Error('upstream must not run for blocked premium model');
    };
    const blocked = await ownerAgent.post('/api/chat').send({
        model: 'claude',
        temporary: true,
        messages: [{ role: 'user', text: 'hello' }],
    });
    assert.equal(blocked.status, 403);
});

test('owner Plus mode allows chat after mode restore', async () => {
    await ownerAgent.patch('/api/access-mode').send({ mode: 'developer' });
    global.fetch = async (url) => {
        if (String(url).includes('generativelanguage.googleapis.com')) {
            const encoder = new TextEncoder();
            return new Response(new ReadableStream({
                start(controller) {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] })}\n\n`));
                    controller.close();
                },
            }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
        }
        return new Response('{}', { status: 404 });
    };
    const reply = await ownerAgent.post('/api/chat').send({
        model: 'smart',
        temporary: true,
        messages: [{ role: 'user', content: 'hello' }],
    });
    assert.equal(reply.status, 200);
});
