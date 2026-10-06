const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const {
    isBillingOrQuotaFailure,
    isTransientCapacityFailure,
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
});
