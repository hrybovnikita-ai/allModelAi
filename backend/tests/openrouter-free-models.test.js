const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    NEMOTRON_FREE_MODEL,
    DEEPSEEK_R1_FREE_MODEL,
    OPENROUTER_CHAT_COMPLETIONS_URL,
    OPENROUTER_CHAT_FREE_KEY_ENV,
    OPENROUTER_DEEPSEEK_FREE_KEY_ENV,
    isOpenRouterFreeConfigured,
    isOpenRouterFreeSlug,
    mapOpenRouterFreeHttpError,
    missingOpenRouterFreeConfigPayload,
    resolveOpenRouterFreeModelId,
    resolveOpenRouterFreeRoute,
} = require('../src/services/openRouterFreeModels');
const { findRoutedModelWithApiKey } = require('../src/chatProviderRuntime');
const { getCapabilities, displayModelName } = require('../src/services/smartRouter2/capabilities');
const { selectSmartRoute } = require('../src/services/smartRouter2');
const modelVariants = require('../src/data/modelVariants.json');

function clearKeys() {
    delete process.env[OPENROUTER_CHAT_FREE_KEY_ENV];
    delete process.env[OPENROUTER_DEEPSEEK_FREE_KEY_ENV];
    delete process.env.AllModelAI_DeepSeek_Free_v2;
    delete process.env['AllModelAI-DeepSeek-Free-v2'];
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.ALLMODELAI_OPENROUTER_API_KEY;
    delete process.env.API_KEY;
}

test('OpenRouter free model registry', () => {
    assert.equal(NEMOTRON_FREE_MODEL, 'nvidia/nemotron-3-ultra-550b-a55b:free');
    assert.equal(DEEPSEEK_R1_FREE_MODEL, 'deepseek/deepseek-r1-0528:free');
    assert.equal(OPENROUTER_CHAT_COMPLETIONS_URL, 'https://openrouter.ai/api/v1/chat/completions');
    assert.equal(isOpenRouterFreeSlug('nemotron'), true);
    assert.equal(isOpenRouterFreeSlug('deepseek'), false);
    assert.equal(modelVariants.nemotron?.[0]?.gateway, NEMOTRON_FREE_MODEL);
    assert.equal(modelVariants.nemotron?.[0]?.direct, NEMOTRON_FREE_MODEL);
    assert.ok(NEMOTRON_FREE_MODEL.endsWith(':free'));
    assert.doesNotMatch(NEMOTRON_FREE_MODEL, /:paid|pro$/);
});

test('mocked streaming request body always includes the free Nemotron model id', async () => {
    clearKeys();
    process.env.OPENROUTER_API_KEY = 'shared-or-key';
    const route = resolveOpenRouterFreeRoute('nemotron');
    assert.ok(route);

    const originalFetch = global.fetch;
    let captured;
    global.fetch = async (url, options = {}) => {
        captured = {
            url: String(url),
            body: JSON.parse(String(options.body || '{}')),
            auth: String(options.headers?.Authorization || options.headers?.authorization || ''),
        };
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
            start(controller) {
                controller.enqueue(encoder.encode(
                    'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n'
                    + 'data: [DONE]\n\n',
                ));
                controller.close();
            },
        });
        return new Response(stream, {
            status: 200,
            headers: { 'Content-Type': 'text/event-stream' },
        });
    };

    try {
        const response = await fetch(OPENROUTER_CHAT_COMPLETIONS_URL, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${route.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: route.modelId,
                stream: true,
                messages: [{ role: 'user', content: 'Hello' }],
            }),
        });
        assert.equal(response.status, 200);
        assert.equal(captured.url, OPENROUTER_CHAT_COMPLETIONS_URL);
        assert.equal(captured.body.model, NEMOTRON_FREE_MODEL);
        assert.equal(captured.body.stream, true);
        assert.equal(captured.auth, 'Bearer shared-or-key');
        assert.doesNotMatch(captured.body.model, /nvidia\/nemotron-3-ultra-550b-a55b(?!:free)/);
    } finally {
        global.fetch = originalFetch;
        clearKeys();
    }
});

test('DeepSeek R1 still requires a dedicated free key (shared OpenRouter key is not enough)', () => {
    clearKeys();
    process.env.OPENROUTER_API_KEY = 'general-or-key';
    assert.equal(isOpenRouterFreeConfigured('deepseek-r1'), false);
    assert.equal(resolveOpenRouterFreeRoute('deepseek-r1'), null);
});

test('Nemotron resolves via shared OPENROUTER_API_KEY', () => {
    clearKeys();
    process.env.OPENROUTER_API_KEY = 'shared-or-key';
    assert.equal(isOpenRouterFreeConfigured('nemotron'), true);
    const route = resolveOpenRouterFreeRoute('nemotron');
    assert.equal(route.modelId, NEMOTRON_FREE_MODEL);
    assert.equal(route.apiKey, 'shared-or-key');
    assert.equal(route.keySourceEnv, 'OPENROUTER_API_KEY');
    assert.match(route.displayName, /NVIDIA Nemotron 3 Ultra/i);
});

test('Nemotron prefers OPENROUTER_CHAT_FREE_API_KEY over shared OpenRouter key', () => {
    clearKeys();
    process.env.OPENROUTER_API_KEY = 'shared-or-key';
    process.env[OPENROUTER_CHAT_FREE_KEY_ENV] = 'chat-free-key';
    const route = resolveOpenRouterFreeRoute('nemotron');
    assert.equal(route.modelId, NEMOTRON_FREE_MODEL);
    assert.equal(route.keySourceEnv, OPENROUTER_CHAT_FREE_KEY_ENV);
    assert.equal(route.apiKey, 'chat-free-key');
});

test('resolveOpenRouterFreeRoute uses OPENROUTER_DEEPSEEK_FREE_API_KEY', () => {
    clearKeys();
    process.env[OPENROUTER_DEEPSEEK_FREE_KEY_ENV] = 'ds-free-key';
    const route = resolveOpenRouterFreeRoute('deepseek-r1');
    assert.equal(route.modelId, DEEPSEEK_R1_FREE_MODEL);
    assert.equal(route.keySourceEnv, OPENROUTER_DEEPSEEK_FREE_KEY_ENV);
    assert.equal(route.apiKey, 'ds-free-key');
});

test('never upgrades free slug to a paid OpenRouter model id', () => {
    assert.equal(
        resolveOpenRouterFreeModelId('nemotron', 'nvidia/nemotron-3-ultra-550b-a55b'),
        NEMOTRON_FREE_MODEL,
    );
    assert.equal(
        resolveOpenRouterFreeModelId('nemotron', NEMOTRON_FREE_MODEL),
        NEMOTRON_FREE_MODEL,
    );
});

test('missing key and free-tier HTTP errors map clearly', () => {
    clearKeys();
    const missing = missingOpenRouterFreeConfigPayload('nemotron');
    assert.equal(missing.code, 'OPENROUTER_FREE_NOT_CONFIGURED');
    assert.match(missing.message, /OPENROUTER_API_KEY/);

    assert.equal(mapOpenRouterFreeHttpError(401).code, 'OPENROUTER_FREE_AUTH_FAILED');
    assert.equal(mapOpenRouterFreeHttpError(402).code, 'OPENROUTER_FREE_CREDITS');
    assert.equal(mapOpenRouterFreeHttpError(403).clientStatus, 403);
    assert.equal(mapOpenRouterFreeHttpError(429).retryable, true);
    assert.equal(mapOpenRouterFreeHttpError(429).code, 'OPENROUTER_FREE_RATE_LIMITED');
    assert.equal(mapOpenRouterFreeHttpError(503).code, 'OPENROUTER_FREE_UPSTREAM');
    assert.equal(mapOpenRouterFreeHttpError(504).code, 'OPENROUTER_FREE_TIMEOUT');
    assert.equal(mapOpenRouterFreeHttpError(404).code, 'OPENROUTER_FREE_MODEL_UNAVAILABLE');
});

test('chatProviderRuntime and Smart Router recognize configured Nemotron', () => {
    clearKeys();
    process.env.OPENROUTER_API_KEY = 'shared-or-key';
    assert.equal(findRoutedModelWithApiKey('nemotron', () => true), 'nemotron');
    assert.equal(getCapabilities('nemotron').model, NEMOTRON_FREE_MODEL);
    assert.match(displayModelName('nemotron'), /NVIDIA Nemotron 3 Ultra/i);

    const route = selectSmartRoute('Solve this multi-step logic puzzle carefully', {
        routerMode: 'balanced',
        modelAllowed: (slug) => slug === 'nemotron',
    });
    assert.equal(route.model, 'nemotron');
    assert.match(displayModelName(route.model), /Nemotron/i);
    assert.doesNotMatch(displayModelName(route.model), /claude|gpt-4\.1|paid/i);
});

test('Smart Router skips Nemotron when OpenRouter free route is unconfigured', () => {
    clearKeys();
    assert.equal(findRoutedModelWithApiKey('nemotron', () => true), null);
    const route = selectSmartRoute('Solve this multi-step logic puzzle carefully', {
        routerMode: 'balanced',
        modelAllowed: (slug) => slug === 'nemotron' || slug === 'gemini',
    });
    assert.notEqual(route.model, 'nemotron');
});
