'use strict';

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.ENABLE_PLUS_TEST_MODE = 'true';
process.env.DEVELOPER_EMAILS = 'gpt-route@example.com';
process.env.DB_FILE = path.join(os.tmpdir(), `allmodelai-gpt-route-${process.pid}.sqlite`);
fs.rmSync(process.env.DB_FILE, { force: true });

const {
    looksLikeOpenAiApiKey,
    openAiKey,
    isChatProviderConfigured,
} = require('../src/chatProviderRuntime');
const {
    isOpenRouterInsufficientCredits,
    mapOpenRouterBillingError,
} = require('../src/modelProviderEquivalence');
const { normalizeOpenRouterGatewayModel } = require('../src/services/openRouterModelMapping');
const { syntheticOpenAiSk, syntheticOpenAiSkProj } = require('./syntheticSecrets');

describe('OpenAI key shape for GPT routing', () => {
    test('rejects Cloudflare Workers AI tokens mis-set as OPENAI_API_KEY', () => {
        assert.equal(looksLikeOpenAiApiKey('cfut_ML_example_token_value_here'), false);
        assert.equal(looksLikeOpenAiApiKey(syntheticOpenAiSkProj('abcdefghijklmnopqrstuvwxyz012345')), true);
        assert.equal(looksLikeOpenAiApiKey(syntheticOpenAiSk('abcdefghijklmnopqrstuvwxyz012345')), true);
    });

    test('openAiKey ignores Cloudflare-shaped env values', () => {
        const previous = process.env.OPENAI_API_KEY;
        process.env.OPENAI_API_KEY = 'cfut_not_an_openai_key_abcdefghijklmnop';
        try {
            assert.equal(openAiKey(), '');
            assert.equal(isChatProviderConfigured('openai'), false);
        } finally {
            if (previous === undefined) delete process.env.OPENAI_API_KEY;
            else process.env.OPENAI_API_KEY = previous;
        }
    });
});

describe('OpenRouter insufficient credits messaging', () => {
    test('detects OpenRouter credit failures', () => {
        assert.equal(
            isOpenRouterInsufficientCredits(
                402,
                'Insufficient credits. This account never purchased credits.',
            ),
            true,
        );
    });

    test('GPT billing error recommends OpenAI key, not Gemini', () => {
        const mapped = mapOpenRouterBillingError(
            402,
            'Insufficient credits. This account never purchased credits.',
            { routedModel: 'gpt', gatewayModel: 'openai/gpt-4o-mini' },
        );
        assert.equal(mapped.code, 'OPENROUTER_INSUFFICIENT_CREDITS');
        assert.equal(mapped.provider, 'openrouter');
        assert.match(mapped.message, /OPENAI_API_KEY|OpenAI/i);
        assert.doesNotMatch(mapped.message, /GEMINI_API_KEY/);
        assert.match(mapped.message, /openai\/gpt-4o-mini/);
    });

    test('Gemini billing error may mention GEMINI_API_KEY', () => {
        const mapped = mapOpenRouterBillingError(
            402,
            'Insufficient credits',
            { routedModel: 'gemini', gatewayModel: 'google/gemini-2.5-flash' },
        );
        assert.match(mapped.message, /GEMINI_API_KEY/);
    });
});

describe('GPT-4.1 Mini gateway mapping', () => {
    test('maps OpenRouter gateway id for GPT-4.1 Mini', () => {
        assert.equal(
            normalizeOpenRouterGatewayModel('openai/gpt-4.1-mini', 'gpt'),
            'openai/gpt-4o-mini',
        );
    });
});

describe('GPT chat provider selection HTTP', () => {
    let app;
    let api;
    let originalFetch;
    const previousOpenAi = process.env.OPENAI_API_KEY;
    const previousGemini = process.env.GEMINI_API_KEY;
    const previousOr = process.env.OPENROUTER_API_KEY;
    const previousAllOr = process.env.ALLMODELAI_OPENROUTER_API_KEY;

    before(async () => {
        process.env.OPENAI_API_KEY = 'cfut_misconfigured_cloudflare_token_value';
        process.env.OPENROUTER_API_KEY = 'sk-or-v1-test-openrouter-key-for-routing';
        delete process.env.ALLMODELAI_OPENROUTER_API_KEY;
        process.env.GEMINI_API_KEY = 'test-gemini-should-not-be-used-for-explicit-gpt';
        // Clear module cache so provider helpers see env
        delete require.cache[require.resolve('../src/chatProviderRuntime')];
        delete require.cache[require.resolve('../app')];
        app = require('../app');
        api = request.agent(app);
        await api.post('/api/auth/register').send({
            name: 'GPT Route',
            email: 'gpt-route@example.com',
            password: 'test-password',
        });
        originalFetch = global.fetch;
    });

    after(() => {
        global.fetch = originalFetch;
        if (previousOpenAi === undefined) delete process.env.OPENAI_API_KEY;
        else process.env.OPENAI_API_KEY = previousOpenAi;
        if (previousGemini === undefined) delete process.env.GEMINI_API_KEY;
        else process.env.GEMINI_API_KEY = previousGemini;
        if (previousOr === undefined) delete process.env.OPENROUTER_API_KEY;
        else process.env.OPENROUTER_API_KEY = previousOr;
        if (previousAllOr === undefined) delete process.env.ALLMODELAI_OPENROUTER_API_KEY;
        else process.env.ALLMODELAI_OPENROUTER_API_KEY = previousAllOr;
        try { app.locals.db.close(); } catch { /* ignore */ }
    });

    test('explicit GPT-4.1 Mini does not call OpenAI with Cloudflare-shaped key; reports OpenRouter credits accurately', async () => {
        const urls = [];
        global.fetch = async (url) => {
            urls.push(String(url));
            return new Response(JSON.stringify({
                error: {
                    message: 'Insufficient credits. This account never purchased credits. Make sure your key is on the correct account or org, and if so, purchase more at https://openrouter.ai/settings/credits',
                    code: 402,
                },
            }), { status: 402, headers: { 'Content-Type': 'application/json' } });
        };

        const response = await api.post('/api/chat').send({
            model: 'gpt',
            variant: 'mini',
            temporary: true,
            fallbackEnabled: false,
            messages: [{ role: 'user', text: 'Hello' }],
        });

        assert.equal(response.status, 402);
        assert.equal(response.body.code, 'OPENROUTER_INSUFFICIENT_CREDITS');
        assert.equal(response.body.provider, 'openrouter');
        assert.equal(response.body.requestedModel, 'gpt');
        assert.match(String(response.body.model || ''), /openai\/gpt-4o-mini|openai\/gpt-4\.1-mini/);
        assert.match(response.body.message, /insufficient credits/i);
        assert.match(response.body.message, /OPENAI_API_KEY|OpenAI/i);
        assert.doesNotMatch(response.body.message, /GEMINI_API_KEY/);
        assert.ok(urls.every((item) => !/api\.openai\.com/i.test(item)), 'must not call OpenAI with cfut_ key');
        assert.ok(urls.some((item) => /openrouter\.ai/i.test(item)), 'must attempt OpenRouter for GPT');
        assert.ok(urls.every((item) => !/generativelanguage\.googleapis\.com/i.test(item)), 'must not silently call Gemini for explicit GPT');
    });

    test('valid OpenAI key selects direct OpenAI for GPT-4.1 Mini', async () => {
        process.env.OPENAI_API_KEY = syntheticOpenAiSk('testvalidopenaiakeyvalue1234567890');
        delete require.cache[require.resolve('../src/chatProviderRuntime')];
        const urls = [];
        const bodies = [];
        const encoder = new TextEncoder();
        global.fetch = async (url, options = {}) => {
            urls.push(String(url));
            try { bodies.push(JSON.parse(options.body || '{}')); } catch { bodies.push({}); }
            return new Response(new ReadableStream({
                start(controller) {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: 'Direct OpenAI hello' } }] })}\n\ndata: [DONE]\n\n`));
                    controller.close();
                },
            }), { status: 200 });
        };

        const response = await api.post('/api/chat').send({
            model: 'gpt',
            variant: 'mini',
            temporary: true,
            fallbackEnabled: false,
            messages: [{ role: 'user', text: 'Hello' }],
        });

        assert.equal(response.status, 200);
        assert.match(response.text, /Direct OpenAI hello/);
        assert.match(urls[0], /api\.openai\.com/);
        assert.equal(bodies[0].model, 'gpt-4.1-mini');
        assert.equal(bodies[0].stream, true);
        assert.ok(urls.every((item) => !/openrouter\.ai/i.test(item)));
        assert.ok(urls.every((item) => !/generativelanguage\.googleapis\.com/i.test(item)));
    });

    test('direct OpenAI rate-limit errors are not labeled as OpenRouter Gemini issues', async () => {
        process.env.OPENAI_API_KEY = syntheticOpenAiSk('testvalidopenaiakeyvalue1234567890');
        delete process.env.OPENROUTER_API_KEY;
        delete process.env.ALLMODELAI_OPENROUTER_API_KEY;
        delete require.cache[require.resolve('../src/chatProviderRuntime')];
        delete require.cache[require.resolve('../src/openRouterConfig')];

        global.fetch = async () => new Response(JSON.stringify({
            error: { message: 'Rate limit reached for requests', type: 'rate_limit_error' },
        }), { status: 429, headers: { 'Content-Type': 'application/json' } });

        const response = await api.post('/api/chat').send({
            model: 'gpt',
            variant: 'mini',
            temporary: true,
            fallbackEnabled: false,
            messages: [{ role: 'user', text: 'Hello' }],
        });

        assert.equal(response.status, 429);
        assert.equal(response.body.code, 'OPENAI_RATE_LIMITED');
        assert.equal(response.body.provider, 'openai');
        assert.equal(response.body.model, 'gpt-4.1-mini');
        assert.doesNotMatch(response.body.message, /GEMINI_API_KEY|OpenRouter/i);
    });
});
