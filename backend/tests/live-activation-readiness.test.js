'use strict';

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { buildLiveActivationReadiness } = require('../src/payments/liveActivationReadiness');
const { formatMoney } = require('../src/payments/merchantRevenue');

const KEYS = [
    'STRIPE_SECRET_KEY',
    'STRIPE_PUBLISHABLE_KEY',
    'VITE_STRIPE_PUBLISHABLE_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'STRIPE_MODE',
    'FEATURE_BILLING_LIVE_CHECKOUT',
    'AI_CREDITS_ALLOW_LIVE_CHECKOUT',
    'PAYMENT_PROVIDER',
];

let previous = {};

beforeEach(() => {
    previous = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
    for (const key of KEYS) delete process.env[key];
});

afterEach(() => {
    for (const key of KEYS) {
        if (previous[key] === undefined) delete process.env[key];
        else process.env[key] = previous[key];
    }
});

test('test-mode Stripe is ready for checkout but live charges stay blocked', () => {
    process.env.PAYMENT_PROVIDER = 'stripe';
    process.env.STRIPE_MODE = 'test';
    process.env.STRIPE_SECRET_KEY = 'sk_test_placeholder_not_real';
    process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test_placeholder_not_real';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_placeholder';
    process.env.FEATURE_BILLING_LIVE_CHECKOUT = 'false';

    const readiness = buildLiveActivationReadiness();
    assert.equal(readiness.testMode, true);
    assert.equal(readiness.softwareReadyForTestCheckout, true);
    assert.equal(readiness.liveChargesAllowed, false);
    assert.match(readiness.liveChargesBlockedReason, /test/i);
    assert.ok(Array.isArray(readiness.manualVerificationRequired));
    assert.ok(readiness.manualVerificationRequired.some((item) => item.id === 'merchant_kyc'));
    assert.ok(readiness.activationChecklist.length >= 5);
});

test('live keys without FEATURE_BILLING_LIVE_CHECKOUT remain blocked', () => {
    process.env.PAYMENT_PROVIDER = 'stripe';
    process.env.STRIPE_MODE = 'live';
    process.env.STRIPE_SECRET_KEY = 'sk_live_placeholder_not_real';
    process.env.STRIPE_PUBLISHABLE_KEY = 'pk_live_placeholder_not_real';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_live_placeholder';
    process.env.FEATURE_BILLING_LIVE_CHECKOUT = 'false';
    process.env.STRIPE_ALLOW_LIVE_IN_PRODUCTION = 'true';

    const readiness = buildLiveActivationReadiness();
    assert.equal(readiness.liveChargesAllowed, false);
    assert.equal(readiness.softwareReadyForLiveCheckout, false);
});

test('formatMoney formats cents without inventing balances', () => {
    assert.equal(formatMoney(1500, 'usd'), '$15.00');
    assert.equal(formatMoney(500, 'usd'), '$5.00');
});
