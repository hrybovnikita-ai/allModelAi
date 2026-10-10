const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.DEVELOPER_EMAILS = 'tester@example.com';
process.env.DB_FILE = path.join(os.tmpdir(), `allmodelai-vision-${process.pid}.sqlite`);
process.env.API_KEY = 'test-key';
fs.rmSync(process.env.DB_FILE, { force: true });

const app = require('../app');

const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('vision chat routing', () => {
    let api;
    let originalFetch;

    const geminiStream = () => {
        const encoder = new TextEncoder();
        return new Response(new ReadableStream({
            start(controller) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: 'I see a small red pixel square.' }] } }] })}\n\n`));
                controller.close();
            },
        }), { status: 200 });
    };

    before(async () => {
        api = request.agent(app);
        await api.post('/api/auth/register').send({ name: 'Tester', email: 'tester@example.com', password: 'test-password' });
        originalFetch = global.fetch;
    });

    after(() => {
        global.fetch = originalFetch;
        app.locals.db.close();
    });

    test('rejects unsupported image MIME type', async () => {
        const bad = 'data:image/bmp;base64,QQ==';
        const result = await api.post('/api/chat').send({
            model: 'smart',
            temporary: true,
            messages: [{ role: 'user', text: 'What is this?', image: bad }],
        });
        assert.equal(result.status, 400);
        assert.equal(result.body.code, 'VISION_UNSUPPORTED_FORMAT');
    });

    test('rejects non-vision manual model when image attached', async () => {
        const prev = process.env.GEMINI_API_KEY;
        delete process.env.GEMINI_API_KEY;
        delete process.env.OPENAI_API_KEY;
        delete process.env.ALLMODELAI_OPENROUTER_API_KEY;
        delete process.env.OPENROUTER_API_KEY;
        try {
            const result = await api.post('/api/chat').send({
                model: 'llama',
                temporary: true,
                messages: [{ role: 'user', text: 'Describe', image: tinyPng }],
            });
            assert.equal(result.status, 400);
            assert.equal(result.body.code, 'VISION_UNSUPPORTED_MODEL');
        } finally {
            if (prev === undefined) delete process.env.GEMINI_API_KEY;
            else process.env.GEMINI_API_KEY = prev;
        }
    });

    test('does not pass provider HTTP 500 through as client 500', async () => {
        const prevGemini = process.env.GEMINI_API_KEY;
        process.env.GEMINI_API_KEY = 'test-gemini-key';
        delete process.env.ALLMODELAI_OPENROUTER_API_KEY;
        delete process.env.OPENROUTER_API_KEY;
        global.fetch = async () => new Response(JSON.stringify({ error: { message: 'Internal error' } }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
        try {
            const response = await api.post('/api/chat').send({
                model: 'gemini',
                temporary: true,
                fallbackEnabled: false,
                messages: [{ role: 'user', text: 'Describe', image: tinyPng }],
            });
            assert.equal(response.status, 502);
            assert.equal(response.body.code, 'VISION_PROVIDER_ERROR');
            assert.ok(response.body.correlationId);
        } finally {
            global.fetch = originalFetch;
            if (prevGemini === undefined) delete process.env.GEMINI_API_KEY;
            else process.env.GEMINI_API_KEY = prevGemini;
        }
    });

    test('smart router sends inline image to Gemini generateContent', async () => {
        const prevGemini = process.env.GEMINI_API_KEY;
        process.env.GEMINI_API_KEY = 'test-gemini-key';
        let body;
        global.fetch = async (url, options) => {
            body = JSON.parse(options.body);
            return geminiStream();
        };
        try {
            const response = await api.post('/api/chat').send({
                model: 'smart',
                temporary: true,
                messages: [{ role: 'user', text: 'What do you see?', image: tinyPng }],
            });
            assert.equal(response.status, 200);
            assert.match(response.text, /red pixel/);
            const parts = body.contents?.[0]?.parts || [];
            assert.ok(parts.some((p) => p.inlineData?.data));
            assert.ok(parts.some((p) => p.text));
        } finally {
            global.fetch = originalFetch;
            if (prevGemini === undefined) delete process.env.GEMINI_API_KEY;
            else process.env.GEMINI_API_KEY = prevGemini;
        }
    });

    test('OpenAI path includes image_url content blocks', async () => {
        const prevOpenAi = process.env.OPENAI_API_KEY;
        const prevGemini = process.env.GEMINI_API_KEY;
        process.env.OPENAI_API_KEY = 'test-openai';
        delete process.env.GEMINI_API_KEY;
        let body;
        global.fetch = async (url, options) => {
            body = JSON.parse(options.body);
            const encoder = new TextEncoder();
            return new Response(new ReadableStream({
                start(controller) {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: 'OpenAI vision answer' } }] })}\n\n`));
                    controller.close();
                },
            }), { status: 200 });
        };
        try {
            const response = await api.post('/api/chat').send({
                model: 'gpt',
                temporary: true,
                messages: [{ role: 'user', text: 'Explain this screenshot', image: tinyPng }],
            });
            assert.equal(response.status, 200);
            assert.match(response.text, /OpenAI vision answer/);
            const userMsg = body.messages?.find((m) => m.role === 'user' && Array.isArray(m.content));
            assert.ok(userMsg);
            assert.ok(userMsg.content.some((part) => part.type === 'image_url'));
        } finally {
            global.fetch = originalFetch;
            if (prevOpenAi === undefined) delete process.env.OPENAI_API_KEY;
            else process.env.OPENAI_API_KEY = prevOpenAi;
            if (prevGemini === undefined) delete process.env.GEMINI_API_KEY;
            else process.env.GEMINI_API_KEY = prevGemini;
        }
    });
});
