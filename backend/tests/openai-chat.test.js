'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const {
    DEFAULT_OPENAI_CHAT_MODEL,
    resolveOpenAiDirectModel,
    mapOpenAiHttpError,
} = require('../src/services/openaiChat');

describe('openaiChat resolveOpenAiDirectModel', () => {
    test('maps GPT-4.1 Mini / Nano / Full variants to OpenAI ids', () => {
        assert.equal(resolveOpenAiDirectModel({ id: 'mini', direct: 'gpt-4.1-mini' }), 'gpt-4.1-mini');
        assert.equal(resolveOpenAiDirectModel({ id: 'nano', direct: 'gpt-4.1-nano' }), 'gpt-4.1-nano');
        assert.equal(resolveOpenAiDirectModel({ id: 'full', direct: 'gpt-4.1' }), 'gpt-4.1');
    });

    test('defaults to gpt-4.1-mini when no variant is selected', () => {
        const previous = process.env.OPENAI_MODEL;
        delete process.env.OPENAI_MODEL;
        try {
            assert.equal(DEFAULT_OPENAI_CHAT_MODEL, 'gpt-4.1-mini');
            assert.equal(resolveOpenAiDirectModel(null), 'gpt-4.1-mini');
        } finally {
            if (previous === undefined) delete process.env.OPENAI_MODEL;
            else process.env.OPENAI_MODEL = previous;
        }
    });
});

describe('openaiChat mapOpenAiHttpError', () => {
    test('maps 401/403 auth failures without mentioning Gemini', () => {
        const auth = mapOpenAiHttpError(401, 'Incorrect API key');
        assert.equal(auth.code, 'OPENAI_AUTH_FAILED');
        assert.equal(auth.provider, 'openai');
        assert.doesNotMatch(auth.message, /GEMINI/i);

        const forbidden = mapOpenAiHttpError(403, 'Project does not have access');
        assert.equal(forbidden.code, 'OPENAI_FORBIDDEN');
    });

    test('distinguishes 429 rate limit from insufficient quota', () => {
        const rate = mapOpenAiHttpError(429, 'Rate limit reached for requests');
        assert.equal(rate.code, 'OPENAI_RATE_LIMITED');
        assert.equal(rate.clientStatus, 429);
        assert.doesNotMatch(rate.message, /insufficient quota|credits/i);

        const quota = mapOpenAiHttpError(429, 'You exceeded your current quota, please check your plan and billing details.');
        assert.equal(quota.code, 'OPENAI_INSUFFICIENT_QUOTA');
        assert.equal(quota.clientStatus, 402);
    });

    test('maps 500/503 upstream failures', () => {
        const upstream = mapOpenAiHttpError(503, 'The server is overloaded');
        assert.equal(upstream.code, 'OPENAI_UPSTREAM');
        assert.equal(upstream.clientStatus, 502);
    });
});
