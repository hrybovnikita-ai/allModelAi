const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    getOpenRouterRecoveryModelCandidates,
    isOpenRouterRecoverableFailure,
    normalizeOpenRouterGatewayModel,
} = require('../src/services/openRouterModelMapping');

test('normalizeOpenRouterGatewayModel preserves GPT-4.1 mini catalog id on OpenRouter', () => {
    assert.equal(normalizeOpenRouterGatewayModel('openai/gpt-4.1-mini', 'gpt'), 'openai/gpt-4.1-mini');
});

test('recovery candidates include gpt-4o-mini alias after GPT-4.1 mini failure', () => {
    const list = getOpenRouterRecoveryModelCandidates({
        primary: 'openai/gpt-4.1-mini',
        failedModel: 'openai/gpt-4.1-mini',
        routedModel: 'gpt',
    });
    assert.ok(list.includes('openai/gpt-4o-mini'));
});

test('isOpenRouterRecoverableFailure detects auth and model access errors', () => {
    assert.equal(isOpenRouterRecoverableFailure(403, 'Forbidden'), true);
    assert.equal(isOpenRouterRecoverableFailure(502, 'Provider returned error: model not found'), true);
    assert.equal(isOpenRouterRecoverableFailure(502, 'Could not connect to the AI service'), false);
});

test('recovery candidates include free OpenRouter models', () => {
    const list = getOpenRouterRecoveryModelCandidates({
        primary: 'openai/gpt-4.1-mini',
        failedModel: 'openai/gpt-4o-mini',
        routedModel: 'gpt',
    });
    assert.ok(list.some((item) => item.includes('free') || item === 'openrouter/free'));
});
