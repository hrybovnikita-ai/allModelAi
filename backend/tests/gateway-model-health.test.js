'use strict';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const {
    markGatewayModelBlocked,
    isGatewayModelBlocked,
    isSlugBlockedByGatewayHealth,
    clearGatewayModelHealthForTests,
} = require('../src/services/gatewayModelHealth');
const {
    listEligibleAnoninSlugs,
    isAnoninVirtualSlug,
} = require('../src/services/anoninService');
const { recordProviderRequest, resetForTests, passiveStatusForProvider } = require('../src/services/providerRequestTelemetry');
const { slugDependsOnOpenRouterPaidCredits } = require('../src/chatProviderRuntime');
const { normalizeOpenRouterGatewayModel } = require('../src/services/openRouterModelMapping');

beforeEach(() => {
    clearGatewayModelHealthForTests();
    resetForTests();
    process.env.GEMINI_API_KEY = 'test-gemini-key-for-anonin';
    process.env.OPENROUTER_API_KEY = 'sk-or-v1-test-openrouter-key';
    delete process.env.OPENAI_API_KEY;
    delete process.env.CLAUDE_API_KEY;
});

test('gateway model health blocks specific OpenRouter model ids', () => {
    markGatewayModelBlocked({
        gatewayModel: 'qwen/qwen-2.5-72b-instruct',
        slug: 'qwen',
        reason: 'quota_exhausted',
    });
    assert.equal(isGatewayModelBlocked('qwen/qwen-2.5-72b-instruct'), true);
    assert.equal(isSlugBlockedByGatewayHealth('qwen'), true);
    assert.equal(isGatewayModelBlocked('google/gemini-2.5-flash'), false);
});

test('Anonin excludes qwen when OpenRouter is quota_exhausted', () => {
    recordProviderRequest({
        provider: 'openrouter',
        success: false,
        httpStatus: 402,
        message: 'Insufficient credits',
        errorCategory: 'quota_exhausted',
    });
    const status = passiveStatusForProvider('openrouter', true);
    assert.equal(status.operationalStatus, 'quota_exhausted');
    assert.equal(slugDependsOnOpenRouterPaidCredits('qwen'), true);

    const allowed = () => true;
    const eligible = listEligibleAnoninSlugs(allowed, { hasVision: false });
    assert.equal(eligible.includes('qwen'), false);
    assert.equal(eligible.includes('llama'), false);
    assert.ok(eligible.includes('gemini') || eligible.includes('nemotron') || eligible.includes('cloudflare'));
});

test('Anonin excludes slug after gateway model block even if OpenRouter looks healthy', () => {
    markGatewayModelBlocked({
        gatewayModel: 'qwen/qwen3-235b-a22b',
        slug: 'qwen',
        reason: 'quota_exhausted',
    });
    const eligible = listEligibleAnoninSlugs(() => true, { hasVision: false });
    assert.equal(eligible.includes('qwen'), false);
});

test('normalizeOpenRouterGatewayModel preserves GPT-4.1 catalog ids', () => {
    assert.equal(normalizeOpenRouterGatewayModel('openai/gpt-4.1-mini', 'gpt'), 'openai/gpt-4.1-mini');
    assert.equal(normalizeOpenRouterGatewayModel('openai/gpt-4.1-nano', 'gpt'), 'openai/gpt-4.1-nano');
    assert.equal(normalizeOpenRouterGatewayModel('openai/gpt-4.1', 'gpt'), 'openai/gpt-4.1');
});

test('default qwen gateway id is catalog qwen3, not stale 2.5', () => {
    const { MODEL_CAPABILITIES } = require('../src/services/smartRouter2/capabilities');
    assert.match(MODEL_CAPABILITIES.qwen.model, /qwen3/i);
    assert.doesNotMatch(MODEL_CAPABILITIES.qwen.model, /qwen-2\.5-72b/);
});

test('anonin virtual slug helpers still work', () => {
    assert.equal(isAnoninVirtualSlug('anonin'), true);
});
