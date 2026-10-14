const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.ENABLE_PLUS_TEST_MODE = 'true';
process.env.DEVELOPER_EMAILS = 'or-recovery@example.com';
process.env.DB_FILE = path.join(os.tmpdir(), `allmodelai-or-recovery-${process.pid}.sqlite`);
fs.rmSync(process.env.DB_FILE, { force: true });

const upstream = () => {
    const encoder = new TextEncoder();
    return new Response(new ReadableStream({
        start(controller) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: 'Recovered answer' } }] })}\n\n`));
            controller.close();
        },
    }), { status: 200 });
};

let app;
let originalFetch;

test('recovers from OpenRouter model access failure via free fallback model', async () => {
    const previousOpenAi = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    process.env.API_KEY = 'test-or-key';

    originalFetch = global.fetch;
    const bodies = [];
    global.fetch = async (url, options) => {
        const target = String(url);
        if (!target.includes('openrouter.ai')) return new Response('{}', { status: 404 });
        bodies.push(JSON.parse(options.body));
        if (bodies.length === 1) {
            return new Response(JSON.stringify({ error: { message: 'No endpoints found for model' } }), {
                status: 403,
                headers: { 'Content-Type': 'application/json' },
            });
        }
        return upstream();
    };

    app = require('../app');
    const api = request.agent(app);
    await api.post('/api/auth/register').send({
        name: 'OR Recovery',
        email: 'or-recovery@example.com',
        password: 'or-recovery-password',
    });

    const response = await api.post('/api/chat').send({
        model: 'gpt',
        variant: 'mini',
        temporary: true,
        messages: [{ role: 'user', text: 'hello' }],
    });

    assert.equal(response.status, 200, response.text?.slice?.(0, 300));
    assert.match(response.text, /Recovered answer/);
    assert.equal(bodies.length, 2);
    assert.equal(bodies[0].model, 'openai/gpt-4o-mini');
    assert.notEqual(bodies[1].model, bodies[0].model);

    global.fetch = originalFetch;
    app.locals.db.close();
    if (previousOpenAi === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousOpenAi;
});

after(() => {
    if (originalFetch) global.fetch = originalFetch;
});
