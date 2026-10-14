const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    listEligibleAnoninSlugs,
    pickRandomSlug,
    maskStreamMetaForAnonin,
    buildIdentityLabels,
    normalizeStrategy,
    normalizeVirtualChatModelSlug,
    isAnoninVirtualSlug,
    ANONIN_SLUG,
    DISPLAY_NAME,
} = require('../src/services/anoninService');
const { hasModelAccess } = require('../src/billing/accessControl');

test('Anonin catalog constants', () => {
    assert.equal(ANONIN_SLUG, 'anonin');
    assert.equal(DISPLAY_NAME, 'Anonin Model');
});

test('normalizeVirtualChatModelSlug maps typos to anonin', () => {
    assert.equal(normalizeVirtualChatModelSlug('anonim'), 'anonin');
    assert.equal(normalizeVirtualChatModelSlug('anonymous'), 'anonin');
    assert.equal(normalizeVirtualChatModelSlug('Anonin'), 'anonin');
    assert.equal(normalizeVirtualChatModelSlug('Anonin Model'), 'anonin');
    assert.equal(normalizeVirtualChatModelSlug('gpt'), 'gpt');
    assert.equal(isAnoninVirtualSlug('anonim'), true);
});

test('hasModelAccess allows anonin virtual mode', () => {
    assert.equal(hasModelAccess({ models: ['gemini'] }, 'anonin'), true);
});

test('listEligibleAnoninSlugs respects subscription filter', () => {
    const allowed = (slug) => slug === 'gemini' || slug === 'anonin';
    const eligible = listEligibleAnoninSlugs(allowed, { hasVision: false });
    assert.ok(eligible.includes('gemini') || eligible.length === 0);
    assert.equal(eligible.includes('smart'), false);
    assert.equal(eligible.includes('anonin'), false);
});

test('pickRandomSlug varies selection', () => {
    const picks = new Set();
    for (let i = 0; i < 20; i += 1) {
        picks.add(pickRandomSlug(['gpt', 'gemini', 'claude']));
    }
    assert.ok(picks.size >= 2);
});

test('maskStreamMetaForAnonin hides provider identity', () => {
    const masked = maskStreamMetaForAnonin({
        unlimited: false,
        plan: 'free',
        requestedModel: 'gpt',
        routedModel: 'gemini',
        actualModelId: 'google/gemini-2.5-flash',
        actualProviderModel: 'gemini',
        routeReason: 'secret',
        router: { selectedModel: 'Gemini' },
        knowledgeSources: [],
    }, { assistantMessageId: 'msg-1' });
    assert.equal(masked.requestedModel, 'anonin');
    assert.equal(masked.routedModel, 'anonin');
    assert.equal(masked.actualModelId, undefined);
    assert.equal(masked.router, undefined);
    assert.equal(masked.anoninMode, true);
    assert.equal(masked.assistantMessageId, 'msg-1');
});

test('buildIdentityLabels uses capability registry', () => {
    const labels = buildIdentityLabels('gemini', 'google/gemini-2.5-flash');
    assert.equal(labels.actualSlug, 'gemini');
    assert.match(labels.providerLabel, /Google/i);
    assert.match(labels.modelLabel, /gemini/i);
});

test('normalizeStrategy', () => {
    assert.equal(normalizeStrategy('SMART'), 'smart');
    assert.equal(normalizeStrategy('per-message'), 'per_message');
    assert.equal(normalizeStrategy(undefined), 'random');
});
