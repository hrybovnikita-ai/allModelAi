const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const {
    isBillingOrQuotaFailure,
    isOpenRouterInsufficientCredits,
    isTransientCapacityFailure,
    mapOpenRouterBillingError,
    upstreamErrorMessage,
} = require('../src/modelProviderEquivalence');

describe('modelProviderEquivalence', () => {
    test('detects billing and quota failures', () => {
        assert.equal(isBillingOrQuotaFailure(402, ''), true);
        assert.equal(isBillingOrQuotaFailure(429, 'You have no credits remaining'), true);
        assert.equal(isBillingOrQuotaFailure(429, 'Rate limit exceeded'), true);
        assert.equal(isBillingOrQuotaFailure(500, 'internal'), false);
    });

    test('detects transient capacity failures', () => {
        assert.equal(isTransientCapacityFailure(503, ''), true);
        assert.equal(isTransientCapacityFailure(429, 'high demand'), true);
    });

    test('extracts upstream error messages safely', () => {
        assert.equal(upstreamErrorMessage({ error: { message: 'bad model' } }), 'bad model');
    });

    test('OpenRouter GPT credit errors do not recommend Gemini', () => {
        assert.equal(isOpenRouterInsufficientCredits(402, 'Insufficient credits'), true);
        const mapped = mapOpenRouterBillingError(402, 'Insufficient credits', {
            routedModel: 'gpt',
            gatewayModel: 'openai/gpt-4o-mini',
        });
        assert.equal(mapped.code, 'OPENROUTER_INSUFFICIENT_CREDITS');
        assert.doesNotMatch(mapped.message, /GEMINI_API_KEY/);
        assert.match(mapped.message, /OPENAI_API_KEY|OpenAI/i);
    });
});
