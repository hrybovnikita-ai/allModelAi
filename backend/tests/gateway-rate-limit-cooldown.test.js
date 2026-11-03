'use strict';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const {
    markGatewayModelBlocked,
    isGatewayModelBlocked,
    clearGatewayModelHealthForTests,
    ttlMsForReason,
    RATE_LIMIT_COOLDOWN_MS,
} = require('../src/services/gatewayModelHealth');

beforeEach(() => {
    clearGatewayModelHealthForTests();
});

test('rate_limited blocks use short cooldown TTL and auto-recover', () => {
    markGatewayModelBlocked({
        gatewayModel: 'gemini-3.1-pro-preview',
        reason: 'rate_limited',
        blockSlug: false,
    });
    assert.equal(isGatewayModelBlocked('gemini-3.1-pro-preview'), true);
    assert.equal(ttlMsForReason('rate_limited'), RATE_LIMIT_COOLDOWN_MS);
});

test('quota_exhausted keeps default long TTL', () => {
    assert.ok(ttlMsForReason('quota_exhausted') >= 60 * 60 * 1000);
});
