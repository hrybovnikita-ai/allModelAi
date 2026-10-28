const { test } = require('node:test');
const assert = require('node:assert/strict');

const { selectSmartRoute } = require('../src/services/smartRouter2');
const { classifyFailure } = require('../src/services/automaticFallback');
const { categorizeHttpStatus } = require('../src/services/smartRouter2/fallbacks');

test('HTTP 402 is a fallback-eligible billing failure', () => {
    assert.equal(categorizeHttpStatus(402), 'rate_limit');
    assert.equal(classifyFailure({
        status: 402,
        detail: 'This request requires more credits, or fewer max_tokens.',
    }), 'rate_limit');
});

test('research routes avoid OpenRouter-only Perplexity when Gemini direct is configured', () => {
    const previous = {
        GEMINI_API_KEY: process.env.GEMINI_API_KEY,
        PERPLEXITY_API_KEY: process.env.PERPLEXITY_API_KEY,
        ALLMODELAI_OPENROUTER_API_KEY: process.env.ALLMODELAI_OPENROUTER_API_KEY,
        OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    };
    process.env.GEMINI_API_KEY = 'gemini-test-key-value';
    delete process.env.PERPLEXITY_API_KEY;
    process.env.ALLMODELAI_OPENROUTER_API_KEY = 'sk-or-test-openrouter-key';
    delete process.env.OPENROUTER_API_KEY;
    try {
        const route = selectSmartRoute('Compare the latest public research on fusion energy and cite sources', {
            routerMode: 'balanced',
            modelAllowed: () => true,
        });
        assert.notEqual(route.model, 'perplexity');
        assert.equal(route.model, 'gemini');
    } finally {
        for (const [key, value] of Object.entries(previous)) {
            if (value == null) delete process.env[key];
            else process.env[key] = value;
        }
    }
});
