const test = require('node:test');
const assert = require('node:assert/strict');

const { stripeConfigurationReport, publishableKeyFromEnv } = require('../src/payments/stripeConfig');

test('stripeConfigurationReport lists missing env vars without exposing secrets', () => {
    const prev = {
        secret: process.env.STRIPE_SECRET_KEY,
        pub: process.env.STRIPE_PUBLISHABLE_KEY,
        vitePub: process.env.VITE_STRIPE_PUBLISHABLE_KEY,
        mode: process.env.STRIPE_MODE,
    };
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_PUBLISHABLE_KEY;
    delete process.env.VITE_STRIPE_PUBLISHABLE_KEY;
    process.env.STRIPE_MODE = 'test';

    try {
        const report = stripeConfigurationReport();
        assert.equal(report.ok, false);
        assert.ok(report.missing.includes('STRIPE_SECRET_KEY'));
        assert.ok(report.missing.some((v) => v.includes('STRIPE_PUBLISHABLE_KEY')));
        assert.equal(publishableKeyFromEnv(), '');
    } finally {
        if (prev.secret) process.env.STRIPE_SECRET_KEY = prev.secret;
        else delete process.env.STRIPE_SECRET_KEY;
        if (prev.pub) process.env.STRIPE_PUBLISHABLE_KEY = prev.pub;
        else delete process.env.STRIPE_PUBLISHABLE_KEY;
        if (prev.vitePub) process.env.VITE_STRIPE_PUBLISHABLE_KEY = prev.vitePub;
        else delete process.env.VITE_STRIPE_PUBLISHABLE_KEY;
        if (prev.mode) process.env.STRIPE_MODE = prev.mode;
        else delete process.env.STRIPE_MODE;
    }
});

test('stripeConfigurationReport ok when test keys and publishable key are set', () => {
    const prev = {
        secret: process.env.STRIPE_SECRET_KEY,
        pub: process.env.STRIPE_PUBLISHABLE_KEY,
        provider: process.env.PAYMENT_PROVIDER,
        wfp: process.env.WAYFORPAY_DOMAIN,
        mode: process.env.STRIPE_MODE,
    };
    process.env.STRIPE_MODE = 'test';
    process.env.STRIPE_SECRET_KEY = 'sk_test_placeholder_not_real';
    process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test_placeholder_not_real';
    process.env.PAYMENT_PROVIDER = 'stripe';
    delete process.env.WAYFORPAY_DOMAIN;

    try {
        const report = stripeConfigurationReport();
        assert.equal(report.ok, true);
        assert.equal(report.testMode, true);
        assert.equal(report.secretKeyConfigured, true);
        assert.equal(report.publishableKeyConfigured, true);
    } finally {
        if (prev.secret) process.env.STRIPE_SECRET_KEY = prev.secret;
        else delete process.env.STRIPE_SECRET_KEY;
        if (prev.pub) process.env.STRIPE_PUBLISHABLE_KEY = prev.pub;
        else delete process.env.STRIPE_PUBLISHABLE_KEY;
        if (prev.provider) process.env.PAYMENT_PROVIDER = prev.provider;
        else delete process.env.PAYMENT_PROVIDER;
        if (prev.wfp) process.env.WAYFORPAY_DOMAIN = prev.wfp;
        else delete process.env.WAYFORPAY_DOMAIN;
        if (prev.mode) process.env.STRIPE_MODE = prev.mode;
        else delete process.env.STRIPE_MODE;
    }
});
