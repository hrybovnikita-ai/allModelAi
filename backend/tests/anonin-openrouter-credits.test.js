'use strict';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const {
    listEligibleAnoninSlugs,
    preferDirectAnoninSlugs,
    pickEmergencyAnoninSlug,
    resolveAnoninRouting,
    isHealthExcluded,
    buildIdentityLabels,
} = require('../src/services/anoninService');
const { slugDependsOnOpenRouterPaidCredits } = require('../src/chatProviderRuntime');
const {
    markOpenRouterCreditsExhausted,
    clearGatewayModelHealthForTests,
    isOpenRouterCreditsExhausted,
} = require('../src/services/gatewayModelHealth');
const { resolveGeminiDirectModel } = require('../src/services/geminiModelRouting');

beforeEach(() => {
    clearGatewayModelHealthForTests();
    process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-gemini-key';
    process.env.OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || 'test-openrouter-key';
});

test('OpenRouter HTTP 402 marks the OpenRouter account exhausted', () => {
    markOpenRouterCreditsExhausted();
    assert.equal(isOpenRouterCreditsExhausted(), true);
    assert.equal(isHealthExcluded('cohere'), true);
    assert.equal(isHealthExcluded('llama'), true);
    assert.equal(isHealthExcluded('qwen'), true);
});

test('Anonin does not select Cohere through an exhausted OpenRouter account', () => {
    markOpenRouterCreditsExhausted();
    const eligible = listEligibleAnoninSlugs(() => true);
    assert.equal(eligible.includes('cohere'), false);
    assert.equal(preferDirectAnoninSlugs(eligible).includes('cohere'), false);
    assert.notEqual(pickEmergencyAnoninSlug(() => true), 'cohere');
});

test('Random and Smart Anonin exclude unhealthy OpenRouter-paid providers', async () => {
    markOpenRouterCreditsExhausted();
    const random = await resolveAnoninRouting({
        connection: null,
        email: 'anonin@example.com',
        conversationId: null,
        strategy: 'random',
        modelAllowed: () => true,
        hasVision: false,
        chooseSmartRoute: () => ({ model: 'cohere' }),
        latestPrompt: 'hello',
        routerMode: 'balanced',
        normalizedInputMessages: [{ role: 'user', content: 'hello' }],
        responsePrefs: {},
        routerPerformance: {},
    });
    assert.equal(random.ok, true);
    assert.equal(slugDependsOnOpenRouterPaidCredits(random.slug), false);
    assert.notEqual(random.slug, 'cohere');

    const smart = await resolveAnoninRouting({
        connection: null,
        email: 'anonin@example.com',
        conversationId: null,
        strategy: 'smart',
        modelAllowed: () => true,
        hasVision: false,
        chooseSmartRoute: () => ({ model: 'cohere' }),
        latestPrompt: 'write a research brief',
        routerMode: 'balanced',
        normalizedInputMessages: [{ role: 'user', content: 'write a research brief' }],
        responsePrefs: {},
        routerPerformance: {},
    });
    assert.equal(smart.ok, true);
    assert.notEqual(smart.slug, 'cohere');
    assert.equal(slugDependsOnOpenRouterPaidCredits(smart.slug), false);
});

test('direct Gemini remains selectable after OpenRouter credits are exhausted', () => {
    markOpenRouterCreditsExhausted();
    const eligible = listEligibleAnoninSlugs(() => true);
    assert.equal(eligible.includes('gemini'), true);
    assert.equal(
        resolveGeminiDirectModel({ selectedVariant: { direct: 'gemini-3.5-flash-lite' } }),
        'gemini-3.5-flash-lite',
    );
    assert.equal(
        resolveGeminiDirectModel({ selectedVariant: { direct: 'gemini-3-flash-preview' } }),
        'gemini-3-flash-preview',
    );
});

test('Reveal AI Model reports the slug Anonin actually used', () => {
    const labels = buildIdentityLabels('gemini', 'gemini-3.5-flash-lite');
    assert.equal(labels.actualSlug, 'gemini');
    assert.match(labels.providerLabel, /Google/i);
    assert.equal(labels.gatewayModelId, 'gemini-3.5-flash-lite');
});

test('Emergency fallback never loops OpenRouter-only slugs after 402', () => {
    markOpenRouterCreditsExhausted();
    const seen = new Set();
    for (let i = 0; i < 8; i += 1) {
        const slug = pickEmergencyAnoninSlug(() => true);
        if (!slug) break;
        assert.equal(slugDependsOnOpenRouterPaidCredits(slug), false);
        seen.add(slug);
    }
    assert.ok(seen.size >= 1);
});
