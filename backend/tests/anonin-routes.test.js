const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');

function freshApp() {
    delete require.cache[require.resolve('../app')];
    delete require.cache[require.resolve('../localApp')];
    delete require.cache[require.resolve('../src/db/provider')];
    return require('../app');
}

test('GET /api/chat/anonin/revealed/:id is registered (not 404)', async () => {
    process.env.NODE_ENV = 'test';
    process.env.DB_FILE = path.join(os.tmpdir(), `allmodelai-anonin-reveal-${process.pid}-${Date.now()}.sqlite`);
    process.env.DEVELOPER_EMAILS = 'anonin-route@example.com';

    const app = freshApp();
    const agent = request.agent(app);
    await agent.post('/api/auth/register').send({
        name: 'Anonin Route',
        email: 'anonin-route@example.com',
        password: 'anonin-route-password',
    });

    const conversationId = 'conv-test-1';
    for (const alias of ['anonin', 'anonim', 'anonymous']) {
        const res = await agent.get(`/api/chat/${alias}/revealed/${encodeURIComponent(conversationId)}`);
        assert.notEqual(res.status, 404, `alias ${alias} should hit reveal list handler`);
        assert.equal(res.status, 200, res.text?.slice?.(0, 200));
        assert.equal(res.body.conversationId, conversationId);
        assert.ok(Array.isArray(res.body.messageIds));
    }

    app.locals.db.close();
});

test('POST /api/chat accepts anonim alias and streams via OpenRouter path', async () => {
    process.env.NODE_ENV = 'test';
    process.env.DB_FILE = path.join(os.tmpdir(), `allmodelai-anonin-chat-${process.pid}-${Date.now()}.sqlite`);
    process.env.DEVELOPER_EMAILS = 'anonim-chat@example.com';
    process.env.ENABLE_PLUS_TEST_MODE = 'true';
    process.env.ALLMODELAI_OPENROUTER_API_KEY = 'test-or-key';
    delete process.env.OPENROUTER_API_KEY;
    process.env.OPENAI_API_KEY = 'sk-test-openai-anonin';
    delete process.env.GEMINI_API_KEY;
    delete process.env.CLAUDE_API_KEY;

    const previousFetch = global.fetch;
    let sawOpenRouter = false;
    global.fetch = async (url, options) => {
        if (String(url).includes('openrouter.ai')) {
            sawOpenRouter = true;
            assert.match(String(options?.headers?.Authorization || ''), /^Bearer test-or-key$/);
            const encoder = new TextEncoder();
            return new Response(new ReadableStream({
                start(controller) {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: 'Anonin OK' } }] })}\n\n`));
                    controller.close();
                },
            }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
        }
        return new Response('{}', { status: 404 });
    };

    const app = freshApp();
    try {
        const agent = request.agent(app);
        await agent.post('/api/auth/register').send({
            name: 'Anonim Chat',
            email: 'anonim-chat@example.com',
            password: 'anonim-chat-password',
        });
        const response = await agent.post('/api/chat').send({
            model: 'anonim',
            temporary: true,
            messages: [{ role: 'user', text: 'hello anonin' }],
        });
        assert.notEqual(response.status, 400, response.text?.slice?.(0, 300));
        assert.notEqual(response.body?.code, 'UNSUPPORTED_MODEL');
        assert.equal(response.status, 200, response.text?.slice?.(0, 300));
        assert.equal(sawOpenRouter, true);
        assert.match(response.text, /Anonin OK/);
    } finally {
        global.fetch = previousFetch;
        app.locals.db.close();
    }
});
