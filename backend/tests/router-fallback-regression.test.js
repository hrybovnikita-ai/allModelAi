const { test } = require('node:test');
const assert = require('node:assert/strict');
const { selectSmartRoute } = require('../src/services/smartRouter2');
const { classifyFailure, mayAttemptFallback } = require('../src/services/automaticFallback');
const { CHAT_PROVIDER_ENV } = require('../src/chatProviderRuntime');

test('Smart Router lists only configured, permitted alternatives and excludes its selected model', () => {
    const names = [...new Set(Object.values(CHAT_PROVIDER_ENV).flatMap(entry => [...entry.keys, ...(entry.optional || [])]))];
    const saved = Object.fromEntries(names.map(name => [name, process.env[name]]));
    try {
        names.forEach(name => delete process.env[name]);
        process.env.OPENAI_API_KEY = 'test-only-openai';
        const route = selectSmartRoute('Write a short story', { routerMode: 'quality' });
        assert.equal(route.model, 'gpt');
        assert.ok(!route.fallbackSlugs.includes('gpt'));
        assert.ok(!route.fallbackSlugs.includes('gemini'));
        assert.ok(!route.fallbackSlugs.includes('claude'));
        const restricted = selectSmartRoute('Write a short story', {
            routerMode: 'quality', modelAllowed: slug => slug === 'gpt',
        });
        assert.equal(restricted.model, 'gpt');
        assert.deepEqual(restricted.fallbackSlugs, []);
        process.env.OLLAMA_API_KEY = 'test-only-ollama';
        const ollama = selectSmartRoute('Hello', { modelAllowed: slug => slug === 'ollama' });
        assert.equal(ollama.model, 'ollama');
        assert.deepEqual(ollama.fallbackSlugs, []);
    } finally {
        names.forEach(name => saved[name] === undefined ? delete process.env[name] : process.env[name] = saved[name]);
    }
});

test('authentication and validation status cannot become retryable through billing text', () => {
    for (const status of [401, 403, 400, 422]) {
        assert.equal(mayAttemptFallback(classifyFailure({ status, detail: 'billing quota exceeded' })), false);
    }
    assert.equal(mayAttemptFallback(classifyFailure({ status: 402, detail: 'insufficient credit' })), true);
    assert.equal(mayAttemptFallback(classifyFailure({ status: 429 })), true);
    assert.equal(mayAttemptFallback(classifyFailure({ status: 503 })), true);
});
