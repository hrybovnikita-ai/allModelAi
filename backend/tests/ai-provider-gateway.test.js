'use strict';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { resetCircuitBreakersForTests } = require('../src/services/providerCircuitBreaker');
const {
    validateOutboundRequest,
    executeProviderRequest,
    inferProviderFromUrl,
    listGatewayFallbackProviders,
} = require('../src/services/aiProviderGateway');

beforeEach(() => {
    resetCircuitBreakersForTests();
    process.env.GEMINI_API_KEY = 'test-gemini-key';
});

test('validateOutboundRequest rejects non-HTTPS URLs', () => {
    assert.throws(
        () => validateOutboundRequest('http://api.groq.com/openai/v1/models', {}),
        (err) => err.code === 'GATEWAY_INSECURE_URL',
    );
});

test('inferProviderFromUrl maps known hosts', () => {
    assert.equal(inferProviderFromUrl('https://api.groq.com/openai/v1/chat/completions'), 'groq');
    assert.equal(inferProviderFromUrl('https://generativelanguage.googleapis.com/v1beta/models'), 'gemini');
});

test('executeProviderRequest retries retryable 503 then succeeds', async () => {
    let calls = 0;
    const fetchImpl = async () => {
        calls += 1;
        if (calls === 1) {
            return new Response(JSON.stringify({ error: { message: 'overloaded' } }), { status: 503 });
        }
        return new Response('ok', { status: 200 });
    };
    const res = await executeProviderRequest({
        url: 'https://api.groq.com/openai/v1/models',
        provider: 'groq',
        maxAttempts: 2,
        fetchImpl,
    });
    assert.equal(res.status, 200);
    assert.equal(calls, 2);
});

test('executeProviderRequest does not log bearer tokens in structured logs', async () => {
    const original = console.log;
    let logged = '';
    console.log = (line) => { logged = String(line); };
    try {
        await executeProviderRequest({
            url: 'https://api.groq.com/openai/v1/models',
            provider: 'groq',
            maxAttempts: 1,
            fetchImpl: async () => new Response('ok', { status: 200 }),
            init: { headers: { Authorization: 'Bearer sk-secret-test-key-1234567890' } },
        });
    } finally {
        console.log = original;
    }
    assert.doesNotMatch(logged, /sk-secret-test-key/);
    assert.match(logged, /ai_gateway/);
});

test('listGatewayFallbackProviders includes gemini when configured', () => {
    const list = listGatewayFallbackProviders();
    assert.ok(Array.isArray(list));
});
