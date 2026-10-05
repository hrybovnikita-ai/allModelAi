const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.ENFORCE_CREDIT_LIMITS = 'true';
process.env.GEMINI_API_KEY = 'owner-test-gemini';
process.env.DB_FILE = path.join(os.tmpdir(), `allmodelai-owner-${process.pid}-${Date.now()}.sqlite`);

const app = require('../app');
const originalFetch = global.fetch;

after(() => {
    global.fetch = originalFetch;
    app.locals.db.close();
    delete process.env.ENFORCE_CREDIT_LIMITS;
});

test('owner chat does not decrement internal usage counter', async () => {
    global.fetch = async (url) => {
        if (String(url).includes('generativelanguage.googleapis.com')) {
            const encoder = new TextEncoder();
            return new Response(new ReadableStream({
                start(controller) {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Owner reply' }] } }] })}\n\n`));
                    controller.close();
                },
            }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
        }
        return new Response('{}', { status: 404 });
    };

    const agent = request.agent(app);
    const email = 'owner-usage@example.com';
    const registered = await agent.post('/api/auth/register').send({
        name: 'Owner User',
        email,
        password: 'owner-usage-password',
    });
    assert.equal(registered.status, 201);
    app.locals.db.database.prepare('UPDATE users SET role = ? WHERE lower(email) = ?').run('owner', email);

    const before = await agent.get('/api/credits');
    assert.equal(before.body.isOwner, true);
    assert.equal(before.body.unlimited, true);

    const chat = await agent.post('/api/chat').send({
        model: 'smart',
        temporary: false,
        messages: [{ role: 'user', content: 'count test' }],
    });
    assert.equal(chat.status, 200, chat.text?.slice?.(0, 200));

    const after = await agent.get('/api/credits');
    assert.equal(after.body.used, before.body.used);
});
