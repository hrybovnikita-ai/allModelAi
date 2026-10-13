const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    NEMOTRON_FREE_MODEL,
    DEEPSEEK_R1_FREE_MODEL,
    OPENROUTER_CHAT_FREE_KEY_ENV,
    OPENROUTER_DEEPSEEK_FREE_KEY_ENV,
    isOpenRouterFreeConfigured,
    isOpenRouterFreeSlug,
    mapOpenRouterFreeHttpError,
    resolveOpenRouterFreeRoute,
} = require('../src/services/openRouterFreeModels');

function clearKeys() {
    delete process.env[OPENROUTER_CHAT_FREE_KEY_ENV];
    delete process.env[OPENROUTER_DEEPSEEK_FREE_KEY_ENV];
    delete process.env.AllModelAI_DeepSeek_Free_v2;
    delete process.env['AllModelAI-DeepSeek-Free-v2'];
    delete process.env.OPENROUTER_API_KEY;
}

test('OpenRouter free model registry', () => {
    assert.equal(NEMOTRON_FREE_MODEL, 'nvidia/nemotron-3-ultra-550b-a55b:free');
    assert.equal(DEEPSEEK_R1_FREE_MODEL, 'deepseek/deepseek-r1-0528:free');
    assert.equal(isOpenRouterFreeSlug('nemotron'), true);
    assert.equal(isOpenRouterFreeSlug('deepseek'), false);
});

test('dedicated keys only — general OpenRouter key does not enable free slugs', () => {
    clearKeys();
    process.env.OPENROUTER_API_KEY = 'general-or-key';
    assert.equal(isOpenRouterFreeConfigured('nemotron'), false);
    assert.equal(isOpenRouterFreeConfigured('deepseek-r1'), false);
    assert.equal(resolveOpenRouterFreeRoute('nemotron'), null);
});

test('resolveOpenRouterFreeRoute uses OPENROUTER_DEEPSEEK_FREE_API_KEY', () => {
    clearKeys();
    process.env[OPENROUTER_DEEPSEEK_FREE_KEY_ENV] = 'ds-free-key';
    const route = resolveOpenRouterFreeRoute('deepseek-r1');
    assert.equal(route.modelId, DEEPSEEK_R1_FREE_MODEL);
    assert.equal(route.keySourceEnv, OPENROUTER_DEEPSEEK_FREE_KEY_ENV);
    assert.equal(route.apiKey, 'ds-free-key');
});

test('resolveOpenRouterFreeRoute uses OPENROUTER_CHAT_FREE_API_KEY for nemotron', () => {
    clearKeys();
    process.env[OPENROUTER_CHAT_FREE_KEY_ENV] = 'chat-free-key';
    const route = resolveOpenRouterFreeRoute('nemotron');
    assert.equal(route.modelId, NEMOTRON_FREE_MODEL);
    assert.equal(route.keySourceEnv, OPENROUTER_CHAT_FREE_KEY_ENV);
});

test('mapOpenRouterFreeHttpError covers billing and auth', () => {
    assert.equal(mapOpenRouterFreeHttpError(402).code, 'OPENROUTER_FREE_CREDITS');
    assert.equal(mapOpenRouterFreeHttpError(403).clientStatus, 403);
    assert.equal(mapOpenRouterFreeHttpError(429).retryable, true);
});
