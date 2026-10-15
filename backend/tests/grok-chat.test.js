const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.ENABLE_PLUS_TEST_MODE = 'true';
process.env.DEVELOPER_EMAILS = 'grok-tester@example.com';
process.env.DB_FILE = path.join(os.tmpdir(), `allmodelai-grok-${process.pid}.sqlite`);
fs.rmSync(process.env.DB_FILE, { force: true });

const {
    buildGrokDirectRequestBody,
    getGrokDirectApiKey,
    isOpenRouterStyleApiKey,
    mapGrokHttpError,
    normalizeXaiDirectModelId,
    resolveGrokDirectModel,
    shouldUseGrokDirect,
} = require('../src/services/grokChat');

const upstreamStream = () => {
    const encoder = new TextEncoder();
    return new Response(new ReadableStream({
        start(controller) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: 'Grok answer' } }] })}\n\n`));
            controller.close();
        },
    }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
};

describe('Grok (xAI) chat integration', () => {
    let app;
    let api;
    let originalFetch;

    before(async () => {
        app = require('../app');
        api = request.agent(app);
        await api.post('/api/auth/register').send({
            name: 'Grok Tester',
            email: 'grok-tester@example.com',
            password: 'grok-test-password',
        });
        originalFetch = global.fetch;
    });

    after(() => {
        global.fetch = originalFetch;
        app.locals.db.close();
    });

    test('normalizeXaiDirectModelId strips OpenRouter prefixes', () => {
        assert.equal(normalizeXaiDirectModelId('x-ai/grok-4.3'), 'grok-4.3');
        assert.equal(normalizeXaiDirectModelId('~x-ai/grok-4.6'), 'grok-4.6');
    });

    test('resolveGrokDirectModel maps UI variants to xAI model ids', () => {
        assert.equal(resolveGrokDirectModel({ id: '4.3', direct: 'grok-4.3' }), 'grok-4.3');
        assert.equal(resolveGrokDirectModel({ id: '4.6', direct: 'grok-4.6' }), 'grok-4.6');
        assert.equal(resolveGrokDirectModel(null), 'grok-4.3');
    });

    test('buildGrokDirectRequestBody uses max_completion_tokens and variant reasoning', () => {
        const body = buildGrokDirectRequestBody({
            model: 'grok-4.3',
            systemPrompt: 'sys',
            standardInput: [{ role: 'user', content: 'hi' }],
            outputTokenLimit: 512,
            selectedVariant: { id: '4.3' },
        });
        assert.equal(body.model, 'grok-4.3');
        assert.equal(body.max_completion_tokens, 512);
        assert.equal(body.reasoning_effort, 'medium');
        assert.equal(body.messages[0].role, 'system');
    });

    test('OpenRouter-style keys are not sent to api.x.ai', () => {
        process.env.XAI_API_KEY = 'sk-or-v1-test-openrouter-key';
        process.env.GROK_API_KEY = 'sk-or-v1-test-openrouter-key';
        process.env.API_KEY = 'test-gateway';
        try {
            assert.equal(getGrokDirectApiKey(), '');
            assert.equal(shouldUseGrokDirect('grok'), false);
            assert.equal(isOpenRouterStyleApiKey('sk-or-v1-abc'), true);
        } finally {
            delete process.env.XAI_API_KEY;
            delete process.env.GROK_API_KEY;
        }
    });

    test('successful Grok 4.3 direct chat hits xAI with sanitized model id', async () => {
        delete process.env.GROK_PROVIDER;
        process.env.XAI_API_KEY = 'xai-test-key';
        process.env.API_KEY = 'test-gateway';
        let body;
        let calledUrl = '';
        global.fetch = async (url, options) => {
            calledUrl = String(url);
            body = JSON.parse(options.body);
            return upstreamStream();
        };
        try {
            const grokResponse = await api.post('/api/chat').send({
                model: 'grok',
                variant: '4.3',
                temporary: true,
                messages: [{ role: 'user', text: 'hello' }],
            });
            assert.equal(grokResponse.status, 200);
            assert.match(grokResponse.text, /Grok answer/);
            assert.match(calledUrl, /api\.x\.ai\/v1\/chat\/completions/);
            assert.equal(body.model, 'grok-4.3');
            assert.equal(body.max_completion_tokens, 2048);
            assert.equal(body.reasoning_effort, 'medium');
        } finally {
            global.fetch = originalFetch;
        }
    });

    test('xAI 400 with OpenRouter configured returns GROK_INVALID_REQUEST without switching models', async () => {
        process.env.XAI_API_KEY = 'xai-test-key';
        process.env.API_KEY = 'test-gateway';
        delete process.env.GROK_PROVIDER;
        global.fetch = async (url) => {
            if (String(url).includes('api.x.ai')) {
                return new Response(JSON.stringify({ error: { message: 'Invalid model: x-ai/grok-4.3' } }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' },
                });
            }
            return new Response(JSON.stringify({ error: { message: 'OpenRouter also failed' } }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        };
        try {
            const response = await api.post('/api/chat').send({
                model: 'grok',
                variant: '4.3',
                temporary: true,
                messages: [{ role: 'user', text: 'hello' }],
            });
            assert.equal(response.status, 400);
            assert.equal(response.body.code, 'GROK_INVALID_REQUEST');
            assert.match(response.body.message, /Grok \(xAI\)/i);
            assert.equal(response.body.upstreamStatus, 400);
            assert.ok(response.body.correlationId);
        } finally {
            global.fetch = originalFetch;
        }
    });

    test('mapGrokHttpError maps upstream 400', () => {
        const mapped = mapGrokHttpError(400, 'Invalid model');
        assert.equal(mapped.code, 'GROK_INVALID_REQUEST');
        assert.equal(mapped.clientStatus, 400);
    });

    test('Grok 4.6 High sends high reasoning effort to xAI', async () => {
        process.env.XAI_API_KEY = 'xai-test-key';
        delete process.env.GROK_PROVIDER;
        let body;
        global.fetch = async (_url, options) => {
            body = JSON.parse(options.body);
            return upstreamStream();
        };
        try {
            const response = await api.post('/api/chat').send({
                model: 'grok',
                variant: '4.6',
                temporary: true,
                messages: [{ role: 'user', text: 'hello' }],
            });
            assert.equal(response.status, 200);
            assert.equal(body.model, 'grok-4.6');
            assert.equal(body.reasoning_effort, 'high');
        } finally {
            global.fetch = originalFetch;
        }
    });
});
