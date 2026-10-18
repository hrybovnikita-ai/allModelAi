'use strict';

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.ENABLE_PLUS_TEST_MODE = 'true';
process.env.DEVELOPER_EMAILS = 'gpt-oss-groq@example.com';
process.env.DB_FILE = path.join(os.tmpdir(), `allmodelai-gpt-oss-groq-${process.pid}.sqlite`);
fs.rmSync(process.env.DB_FILE, { force: true });

const {
    GPT_OSS_GROQ_MODEL_ID,
    GPT_OSS_GROQ_SLUG,
    GPT_OSS_GROQ_DISPLAY_NAME,
    shouldUseGroqDirect,
    resolveGroqDirectModel,
    mapGroqHttpError,
    isGptOssGroqSlug,
} = require('../src/services/groqChat');
const { displayModelName, getCapabilities } = require('../src/services/smartRouter2/capabilities');
const { routedModelHasApiKey, slugDependsOnOpenRouterPaidCredits } = require('../src/chatProviderRuntime');
const { listEligibleAnoninSlugs, buildIdentityLabels } = require('../src/services/anoninService');
const { hasModelAccess } = require('../src/billing/accessControl');
const { clearGatewayModelHealthForTests, markGatewayModelBlocked } = require('../src/services/gatewayModelHealth');
const { resetForTests } = require('../src/services/providerRequestTelemetry');

const upstreamStream = (text = 'GPT-OSS Groq answer') => {
    const encoder = new TextEncoder();
    return new Response(new ReadableStream({
        start(controller) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`));
            controller.close();
        },
    }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
};

describe('GPT-OSS 120B GroqCloud helpers', () => {
    test('catalog constants and model id are exact', () => {
        assert.equal(GPT_OSS_GROQ_SLUG, 'gpt-oss-groq');
        assert.equal(GPT_OSS_GROQ_MODEL_ID, 'openai/gpt-oss-120b');
        assert.equal(GPT_OSS_GROQ_DISPLAY_NAME, 'GPT-OSS 120B — Groq');
        assert.equal(displayModelName('gpt-oss-groq'), 'GPT-OSS 120B — Groq');
        assert.equal(getCapabilities('gpt-oss-groq')?.model, 'openai/gpt-oss-120b');
        assert.equal(isGptOssGroqSlug('gpt-oss-groq'), true);
        assert.equal(isGptOssGroqSlug('gpt-oss'), false);
        assert.equal(isGptOssGroqSlug('gpt'), false);
    });

    test('resolves openai/gpt-oss-120b and never GPT-4.1 ids', () => {
        assert.equal(
            resolveGroqDirectModel({ id: '120b', direct: 'openai/gpt-oss-120b' }, 'gpt-oss-groq'),
            'openai/gpt-oss-120b',
        );
        assert.equal(resolveGroqDirectModel(null, 'gpt-oss-groq'), 'openai/gpt-oss-120b');
        assert.doesNotMatch(resolveGroqDirectModel(null, 'gpt-oss-groq'), /gpt-4\.1/);
        assert.equal(resolveGroqDirectModel({ direct: 'llama-3.3-70b-versatile' }, 'groq'), 'llama-3.3-70b-versatile');
    });

    test('direct Groq path requires GROQ_API_KEY and never OpenRouter for gpt-oss-groq', () => {
        const previous = process.env.GROQ_API_KEY;
        delete process.env.GROQ_API_KEY;
        assert.equal(shouldUseGroqDirect('gpt-oss-groq'), false);
        assert.equal(routedModelHasApiKey('gpt-oss-groq'), false);
        process.env.GROQ_API_KEY = 'gsk-test-key';
        assert.equal(shouldUseGroqDirect('gpt-oss-groq'), true);
        assert.equal(routedModelHasApiKey('gpt-oss-groq'), true);
        assert.equal(slugDependsOnOpenRouterPaidCredits('gpt-oss-groq'), false);
        if (previous === undefined) delete process.env.GROQ_API_KEY;
        else process.env.GROQ_API_KEY = previous;
    });

    test('mapGroqHttpError distinguishes rate limit from quota exhaustion', () => {
        assert.equal(mapGroqHttpError(429, 'Rate limit reached').code, 'GROQ_RATE_LIMITED');
        assert.equal(mapGroqHttpError(429, 'Rate limit reached').clientStatus, 429);
        assert.equal(mapGroqHttpError(429, 'Free tier quota exceeded').code, 'GROQ_QUOTA_EXHAUSTED');
        assert.equal(mapGroqHttpError(429, 'Free tier quota exceeded').clientStatus, 402);
        assert.equal(mapGroqHttpError(401).code, 'GROQ_AUTH_FAILED');
        assert.equal(mapGroqHttpError(404).code, 'GROQ_MODEL_NOT_FOUND');
    });

    test('subscription and Anonin identity labels', () => {
        assert.equal(hasModelAccess({ models: ['gpt-oss-groq'] }, 'gpt-oss-groq'), true);
        assert.equal(hasModelAccess({ models: ['gemini'] }, 'gpt-oss-groq'), false);
        const labels = buildIdentityLabels('gpt-oss-groq', GPT_OSS_GROQ_MODEL_ID);
        assert.equal(labels.actualSlug, 'gpt-oss-groq');
        assert.match(labels.providerLabel, /GroqCloud/i);
        assert.equal(labels.modelLabel, 'GPT-OSS 120B — Groq');
        assert.equal(labels.gatewayModelId, GPT_OSS_GROQ_MODEL_ID);
    });

    test('Anonin excludes gpt-oss-groq when gateway-blocked for quota', () => {
        clearGatewayModelHealthForTests();
        resetForTests();
        process.env.GROQ_API_KEY = 'gsk-test-key';
        process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'gemini-test';
        markGatewayModelBlocked({
            gatewayModel: GPT_OSS_GROQ_MODEL_ID,
            slug: 'gpt-oss-groq',
            reason: 'quota_exhausted',
        });
        const eligible = listEligibleAnoninSlugs(() => true);
        assert.equal(eligible.includes('gpt-oss-groq'), false);
        clearGatewayModelHealthForTests();
    });
});

describe('GPT-OSS 120B GroqCloud HTTP routing', () => {
    let app;
    let api;
    let originalFetch;

    before(async () => {
        app = require('../app');
        api = request.agent(app);
        await api.post('/api/auth/register').send({
            name: 'GPT OSS Groq',
            email: 'gpt-oss-groq@example.com',
            password: 'gpt-oss-groq-password',
        });
        originalFetch = global.fetch;
    });

    after(() => {
        global.fetch = originalFetch;
        try { app.locals.db.close(); } catch { /* ignore */ }
    });

    test('streams from Groq endpoint with exact openai/gpt-oss-120b model id', async () => {
        delete process.env.OPENAI_API_KEY;
        delete process.env.ALLMODELAI_OPENROUTER_API_KEY;
        delete process.env.OPENROUTER_API_KEY;
        delete process.env.API_KEY;
        process.env.GROQ_API_KEY = 'gsk-test-streaming-key';
        const urls = [];
        const bodies = [];
        global.fetch = async (url, options = {}) => {
            urls.push(String(url));
            try { bodies.push(JSON.parse(options.body || '{}')); } catch { bodies.push({}); }
            return upstreamStream();
        };
        try {
            const response = await api.post('/api/chat').send({
                model: 'gpt-oss-groq',
                temporary: true,
                fallbackEnabled: false,
                messages: [{ role: 'user', text: 'hello from gpt-oss-groq' }],
            });
            assert.equal(response.status, 200, response.text?.slice?.(0, 400));
            assert.match(response.text, /GPT-OSS Groq answer/);
            assert.ok(urls.every((u) => /api\.groq\.com\/openai\/v1\/chat\/completions/.test(u)));
            assert.ok(urls.every((u) => !/openrouter\.ai/i.test(u)), 'must not call OpenRouter');
            assert.ok(urls.every((u) => !/api\.openai\.com/i.test(u)), 'must not call OpenAI');
            assert.equal(bodies[0].model, 'openai/gpt-oss-120b');
            assert.equal(bodies[0].stream, true);
            assert.match(response.text, /GPT-OSS 120B — Groq|gpt-oss-groq|openai\/gpt-oss-120b/);
        } finally {
            global.fetch = originalFetch;
        }
    });

    test('missing GROQ_API_KEY returns not configured for gpt-oss-groq', async () => {
        delete process.env.GROQ_API_KEY;
        delete process.env.OPENROUTER_API_KEY;
        delete process.env.ALLMODELAI_OPENROUTER_API_KEY;
        delete process.env.API_KEY;
        process.env.GEMINI_API_KEY = 'gemini-keep-alive';
        global.fetch = async () => upstreamStream();
        try {
            const response = await api.post('/api/chat').send({
                model: 'gpt-oss-groq',
                temporary: true,
                messages: [{ role: 'user', text: 'hello' }],
            });
            assert.equal(response.status, 503);
            assert.equal(response.body.code, 'GROQ_GPT_OSS_NOT_CONFIGURED');
        } finally {
            global.fetch = originalFetch;
        }
    });

    test('invalid Groq key surfaces auth error without OpenRouter fallback', async () => {
        process.env.GROQ_API_KEY = 'invalid-key';
        delete process.env.OPENROUTER_API_KEY;
        delete process.env.ALLMODELAI_OPENROUTER_API_KEY;
        delete process.env.API_KEY;
        const urls = [];
        global.fetch = async (url) => {
            urls.push(String(url));
            return new Response(JSON.stringify({ error: { message: 'Invalid API Key' } }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' },
            });
        };
        try {
            const response = await api.post('/api/chat').send({
                model: 'gpt-oss-groq',
                temporary: true,
                fallbackEnabled: false,
                messages: [{ role: 'user', text: 'hello' }],
            });
            assert.equal(response.status, 502);
            assert.equal(response.body.code, 'GROQ_AUTH_FAILED');
            assert.ok(urls.every((u) => /api\.groq\.com/i.test(u)));
            assert.ok(urls.every((u) => !/openrouter\.ai/i.test(u)));
        } finally {
            global.fetch = originalFetch;
        }
    });

    test('Groq free-tier quota exhaustion returns 402 and does not use OpenRouter', async () => {
        process.env.GROQ_API_KEY = 'gsk-quota-key';
        delete process.env.OPENROUTER_API_KEY;
        delete process.env.ALLMODELAI_OPENROUTER_API_KEY;
        delete process.env.API_KEY;
        const urls = [];
        global.fetch = async (url) => {
            urls.push(String(url));
            return new Response(JSON.stringify({ error: { message: 'Free tier quota exceeded' } }), {
                status: 429,
                headers: { 'Content-Type': 'application/json' },
            });
        };
        try {
            const response = await api.post('/api/chat').send({
                model: 'gpt-oss-groq',
                temporary: true,
                fallbackEnabled: false,
                messages: [{ role: 'user', text: 'hello' }],
            });
            assert.equal(response.status, 402);
            assert.equal(response.body.code, 'GROQ_QUOTA_EXHAUSTED');
            assert.ok(urls.every((u) => !/openrouter\.ai/i.test(u)));
        } finally {
            global.fetch = originalFetch;
        }
    });

    test('explicit GPT-4.1 Mini is unchanged and does not route to gpt-oss-groq', async () => {
        process.env.OPENAI_API_KEY = 'sk-testvalidopenaiakeyvalue1234567890abcd';
        process.env.GROQ_API_KEY = 'gsk-should-not-be-used-for-gpt';
        const urls = [];
        const bodies = [];
        global.fetch = async (url, options = {}) => {
            urls.push(String(url));
            try { bodies.push(JSON.parse(options.body || '{}')); } catch { bodies.push({}); }
            return upstreamStream('OpenAI hello');
        };
        try {
            const response = await api.post('/api/chat').send({
                model: 'gpt',
                variant: 'mini',
                temporary: true,
                fallbackEnabled: false,
                messages: [{ role: 'user', text: 'hello' }],
            });
            assert.equal(response.status, 200);
            assert.ok(urls.some((u) => /api\.openai\.com/i.test(u)));
            assert.ok(urls.every((u) => !/api\.groq\.com/i.test(u)));
            assert.equal(bodies[0].model, 'gpt-4.1-mini');
        } finally {
            global.fetch = originalFetch;
            delete process.env.OPENAI_API_KEY;
        }
    });
});
