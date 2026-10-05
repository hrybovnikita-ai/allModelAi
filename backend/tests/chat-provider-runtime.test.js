const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    anyChatProviderConfigured,
    buildNoAiProvidersPayload,
    findRoutedModelWithApiKey,
    isChatProviderConfigured,
    routedModelHasApiKey,
} = require('../src/chatProviderRuntime');

test('routedModelHasApiKey treats OpenRouter as gateway for model slugs', () => {
    const previous = {
        OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
        GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    };
    delete process.env.GEMINI_API_KEY;
    process.env.OPENROUTER_API_KEY = 'or-test-key';
    try {
        assert.equal(routedModelHasApiKey('gemini'), true);
        assert.equal(findRoutedModelWithApiKey('claude', () => true), 'claude');
    } finally {
        if (previous.GEMINI_API_KEY === undefined) delete process.env.GEMINI_API_KEY;
        else process.env.GEMINI_API_KEY = previous.GEMINI_API_KEY;
        if (previous.OPENROUTER_API_KEY === undefined) delete process.env.OPENROUTER_API_KEY;
        else process.env.OPENROUTER_API_KEY = previous.OPENROUTER_API_KEY;
    }
});

test('findRoutedModelWithApiKey falls back along smart router order', () => {
    const previous = process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPEN_AI_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.API_KEY;
    process.env.GEMINI_API_KEY = 'gemini-only';
    try {
        assert.equal(findRoutedModelWithApiKey('gpt', () => true), 'gemini');
    } finally {
        if (previous === undefined) delete process.env.GEMINI_API_KEY;
        else process.env.GEMINI_API_KEY = previous;
    }
});

test('buildNoAiProvidersPayload never includes secret values', () => {
    process.env.OPENAI_API_KEY = 'sk-secret-should-not-appear';
    const payload = buildNoAiProvidersPayload();
    assert.equal(payload.code, 'NO_AI_PROVIDERS');
    assert.doesNotMatch(JSON.stringify(payload), /sk-secret-should-not-appear/);
    assert.equal(anyChatProviderConfigured(), true);
    assert.equal(isChatProviderConfigured('openai'), true);
    delete process.env.OPENAI_API_KEY;
});

test('returns null when no chat provider keys exist', () => {
    const previous = {};
    for (const key of ['OPENAI_API_KEY', 'OPEN_AI_API_KEY', 'GEMINI_API_KEY', 'ALLMODELAI_OPENROUTER_API_KEY', 'OPENROUTER_API_KEY', 'API_KEY', 'CLAUDE_API_KEY']) {
        previous[key] = process.env[key];
        delete process.env[key];
    }
    try {
        assert.equal(anyChatProviderConfigured(), false);
        assert.equal(findRoutedModelWithApiKey('gemini', () => true), null);
    } finally {
        Object.entries(previous).forEach(([key, value]) => {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        });
    }
});
