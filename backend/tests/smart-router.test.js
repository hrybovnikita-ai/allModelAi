const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.DB_FILE = path.join(os.tmpdir(), `allmodelai-smart-router-${process.pid}-${Date.now()}.sqlite`);
process.env.GEMINI_API_KEY = 'test-gemini';
process.env.OPENROUTER_API_KEY = 'test-gateway';
delete process.env.OPENAI_API_KEY;
delete process.env.OPEN_AI_API_KEY;

const app = require('../app');
const originalFetch = global.fetch;
let agent;

before(async () => {
    agent = request.agent(app);
    const registered = await agent.post('/api/auth/register').send({
        name: 'Router User',
        email: 'router@example.com',
        password: 'router-test-password',
    });
    assert.equal(registered.status, 201);
});

after(() => {
    global.fetch = originalFetch;
    app.locals.db.close();
});

test('Smart Router returns 503 when no AI provider is configured', async () => {
    const previous = {
        GEMINI: process.env.GEMINI_API_KEY,
        OR: process.env.OPENROUTER_API_KEY,
    };
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.API_KEY;
    try {
        const response = await agent.post('/api/chat').send({
            model: 'smart',
            temporary: true,
            messages: [{ role: 'user', content: 'hello' }],
        });
        assert.equal(response.status, 503);
        assert.match(response.body.message, /temporarily unavailable/i);
    } finally {
        process.env.GEMINI_API_KEY = previous.GEMINI;
        process.env.OPENROUTER_API_KEY = previous.OR;
    }
});

test('Smart Router preview stays within allowed user models', async () => {
    const preview = await agent.post('/api/router/preview').send({ prompt: 'hello world' });
    assert.equal(preview.status, 200);
    const credits = await agent.get('/api/credits');
    assert.ok(credits.body.models.includes(preview.body.model));
});
