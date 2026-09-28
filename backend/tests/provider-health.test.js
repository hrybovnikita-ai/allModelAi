const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    buildProviderSnapshot,
    resolveAvailableSmartModel,
    buildProviderHealth,
} = require('../src/providerHealth');

test('buildProviderSnapshot never exposes secret values', () => {
    process.env.OPENAI_API_KEY = 'sk-test-key-should-not-leak';
    const snapshot = buildProviderSnapshot();
    const json = JSON.stringify(snapshot);
    assert.doesNotMatch(json, /sk-test-key-should-not-leak/);
    assert.equal(typeof snapshot.openai.configured, 'boolean');
});

test('resolveAvailableSmartModel skips providers marked unavailable by probe cache', async () => {
    const previous = {
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        GEMINI_API_KEY: process.env.GEMINI_API_KEY,
        OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    };
    process.env.OPENAI_API_KEY = 'test-openai';
    process.env.GEMINI_API_KEY = 'test-gemini';
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.API_KEY;

    const originalFetch = global.fetch;
    global.fetch = async (url) => {
        if (String(url).includes('openai.com')) {
            return new Response('{}', { status: 401 });
        }
        if (String(url).includes('generativelanguage.googleapis.com')) {
            return new Response('{}', { status: 200 });
        }
        return new Response('{}', { status: 404 });
    };

    try {
        await buildProviderHealth({ probe: true });
        const modelAllowed = () => true;
        assert.equal(resolveAvailableSmartModel('gpt', modelAllowed), 'gemini');
        assert.equal(resolveAvailableSmartModel('gemini', modelAllowed), 'gemini');
    } finally {
        global.fetch = originalFetch;
        for (const [key, value] of Object.entries(previous)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
    }
});

test('resolveAvailableSmartModel returns null when no provider is available', async () => {
    const previous = {
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        GEMINI_API_KEY: process.env.GEMINI_API_KEY,
        OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
        CLAUDE_API_KEY: process.env.CLAUDE_API_KEY,
    };
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPEN_AI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.API_KEY;
    delete process.env.CLAUDE_API_KEY;

    try {
        assert.equal(resolveAvailableSmartModel('gpt', () => true), null);
    } finally {
        for (const [key, value] of Object.entries(previous)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
    }
});
