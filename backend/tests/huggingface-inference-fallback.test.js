'use strict';

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const {
    getHuggingFaceFallbackChain,
    tryHuggingFaceInferenceChain,
} = require('../src/services/huggingfaceInference');
const { createFallbackTracker } = require('../src/services/automaticFallback');

beforeEach(() => {
    delete process.env.HF_FALLBACK_MODELS;
});

afterEach(() => {
    delete process.env.HF_FALLBACK_MODELS;
});

test('getHuggingFaceFallbackChain prefers Llama family when routedModel is llama', () => {
    const chain = getHuggingFaceFallbackChain({ routedModel: 'llama' });
    assert.ok(chain[0].includes('Llama'), `expected Llama first, got ${chain[0]}`);
});

test('tryHuggingFaceInferenceChain tries next model after 429 and succeeds', async () => {
    let calls = 0;
    const fetchProvider = async (_url, opts) => {
        calls += 1;
        const body = JSON.parse(String(opts.body || '{}'));
        if (calls === 1) {
            assert.ok(String(body.model || '').length > 0);
            return new Response(JSON.stringify({ error: { message: 'rate limit' } }), { status: 429 });
        }
        return new Response('ok', { status: 200, headers: { 'Content-Type': 'text/plain' } });
    };
    process.env.HF_FALLBACK_MODELS = 'org/first:cheapest,org/second:cheapest';
    const tracker = createFallbackTracker({ requestedSlug: 'gpt' });
    const result = await tryHuggingFaceInferenceChain({
        fetchProvider,
        requestSignal: () => new AbortController().signal,
        hfApiKey: 'hf_test_key',
        systemPrompt: 'sys',
        standardInput: [{ role: 'user', content: 'hi' }],
        outputTokenLimit: 100,
        routedModel: 'gpt',
        fallbackTracker: tracker,
        fallbackFailureCategory: 'rate_limit',
        sleepFallback: async () => {},
        computeBackoffMs: () => 0,
        logSmartRouter: () => {},
    });
    assert.equal(result.ok, true);
    assert.equal(result.hfModel, 'org/second:cheapest');
    assert.equal(calls, 2);
});

test('tryHuggingFaceInferenceChain returns ok false when key missing', async () => {
    const result = await tryHuggingFaceInferenceChain({
        fetchProvider: async () => new Response('x', { status: 200 }),
        requestSignal: () => new AbortController().signal,
        hfApiKey: '',
        systemPrompt: 's',
        standardInput: [],
        outputTokenLimit: 50,
        routedModel: 'gpt',
    });
    assert.equal(result.ok, false);
});
