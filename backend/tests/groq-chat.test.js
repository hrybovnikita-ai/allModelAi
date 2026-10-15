const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.ENABLE_PLUS_TEST_MODE = 'true';
process.env.DEVELOPER_EMAILS = 'groq-tester@example.com';
process.env.DB_FILE = path.join(os.tmpdir(), `allmodelai-groq-${process.pid}.sqlite`);
fs.rmSync(process.env.DB_FILE, { force: true });

const {
    getGroqApiKey,
    isGroqConfigured,
    mapGroqHttpError,
} = require('../src/services/groqChat');

const upstreamStream = () => {
    const encoder = new TextEncoder();
    return new Response(new ReadableStream({
        start(controller) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: 'Groq answer' } }] })}\n\n`));
            controller.close();
        },
    }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
};

describe('Groq chat integration', () => {
    let app;
    let api;
    let originalFetch;

    before(async () => {
        app = require('../app');
        api = request.agent(app);
        await api.post('/api/auth/register').send({
            name: 'Groq Tester',
            email: 'groq-tester@example.com',
            password: 'groq-test-password',
        });
        originalFetch = global.fetch;
    });

    after(() => {
        global.fetch = originalFetch;
        app.locals.db.close();
    });

    test('mapGroqHttpError maps auth and rate limits', () => {
        assert.equal(mapGroqHttpError(401).code, 'GROQ_AUTH_FAILED');
        assert.equal(mapGroqHttpError(429).code, 'GROQ_RATE_LIMITED');
        assert.equal(mapGroqHttpError(429).clientStatus, 429);
    });

    test('successful Groq direct chat streams a response', async () => {
        delete process.env.ALLMODELAI_OPENROUTER_API_KEY;
        delete process.env.OPENROUTER_API_KEY;
        delete process.env.API_KEY;
        process.env.GROQ_API_KEY = 'groq-test-key';
        let calledUrl = '';
        global.fetch = async (url) => {
            calledUrl = String(url);
            return upstreamStream();
        };
        try {
            const response = await api.post('/api/chat').send({
                model: 'groq',
                temporary: true,
                messages: [{ role: 'user', text: 'hello' }],
            });
            assert.equal(response.status, 200);
            assert.match(response.text, /Groq answer/);
            assert.match(calledUrl, /api\.groq\.com\/openai\/v1\/chat\/completions/);
        } finally {
            global.fetch = originalFetch;
        }
    });

    test('missing Groq and OpenRouter keys returns provider unavailable', async () => {
        delete process.env.GROQ_API_KEY;
        delete process.env.ALLMODELAI_OPENROUTER_API_KEY;
        delete process.env.OPENROUTER_API_KEY;
        delete process.env.API_KEY;
        delete process.env.GEMINI_API_KEY;
        global.fetch = async () => upstreamStream();
        try {
            assert.equal(isGroqConfigured(), false);
            const response = await api.post('/api/chat').send({
                model: 'groq',
                temporary: true,
                messages: [{ role: 'user', text: 'hello' }],
            });
            assert.equal(response.status, 503);
            assert.equal(response.body.code, 'NO_AI_PROVIDERS');
        } finally {
            global.fetch = originalFetch;
        }
    });

    test('invalid Groq credentials surface auth error to client', async () => {
        delete process.env.ALLMODELAI_OPENROUTER_API_KEY;
        delete process.env.OPENROUTER_API_KEY;
        delete process.env.API_KEY;
        process.env.GROQ_API_KEY = 'invalid-groq-key';
        global.fetch = async (url) => {
            if (String(url).includes('api.groq.com')) {
                return new Response(JSON.stringify({ error: { message: 'Invalid API Key' } }), {
                    status: 401,
                    headers: { 'Content-Type': 'application/json' },
                });
            }
            return upstreamStream();
        };
        try {
            const response = await api.post('/api/chat').send({
                model: 'groq',
                temporary: true,
                messages: [{ role: 'user', text: 'hello' }],
            });
            assert.equal(response.status, 502);
            assert.equal(response.body.code, 'GROQ_AUTH_FAILED');
            assert.match(response.body.message, /Groq rejected/i);
        } finally {
            global.fetch = originalFetch;
        }
    });

    test('Groq 429 rate limit returns retryable client status', async () => {
        process.env.GROQ_API_KEY = 'groq-rate-key';
        delete process.env.ALLMODELAI_OPENROUTER_API_KEY;
        delete process.env.OPENROUTER_API_KEY;
        delete process.env.API_KEY;
        global.fetch = async (url) => {
            if (String(url).includes('api.groq.com')) {
                return new Response(JSON.stringify({ error: { message: 'Rate limit reached' } }), {
                    status: 429,
                    headers: { 'Content-Type': 'application/json' },
                });
            }
            return upstreamStream();
        };
        try {
            const response = await api.post('/api/chat').send({
                model: 'groq',
                temporary: true,
                messages: [{ role: 'user', text: 'hello' }],
            });
            assert.equal(response.status, 429);
            assert.equal(response.body.code, 'GROQ_RATE_LIMITED');
        } finally {
            global.fetch = originalFetch;
        }
    });

    test('getGroqApiKey reads only GROQ_API_KEY env', () => {
        process.env.GROQ_API_KEY = '  "sk-groq-test"  ';
        assert.equal(getGroqApiKey(), 'sk-groq-test');
    });
});
