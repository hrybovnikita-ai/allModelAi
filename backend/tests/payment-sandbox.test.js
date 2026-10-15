const test = require('node:test');
const assert = require('node:assert/strict');
const { buildCheckoutInfo } = require('../src/payments/checkoutInfo');

test('checkout-info hides test banner when live WayForPay is confirmed', () => {
    const prev = {
        testMode: process.env.WAYFORPAY_TEST_MODE,
        live: process.env.WAYFORPAY_LIVE_CONFIRM,
        account: process.env.WAYFORPAY_MERCHANT_ACCOUNT,
        secret: process.env.WAYFORPAY_SECRET_KEY,
        domain: process.env.WAYFORPAY_DOMAIN,
        paymentMode: process.env.PAYMENT_MODE,
        provider: process.env.PAYMENT_PROVIDER,
        stripeSecret: process.env.STRIPE_SECRET_KEY,
        stripeMode: process.env.STRIPE_MODE,
    };
    process.env.PAYMENT_PROVIDER = 'wayforpay';
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_MODE;
    process.env.WAYFORPAY_TEST_MODE = 'false';
    process.env.WAYFORPAY_LIVE_CONFIRM = 'true';
    process.env.WAYFORPAY_MERCHANT_ACCOUNT = 'live_merch';
    process.env.WAYFORPAY_SECRET_KEY = 'secret';
    process.env.WAYFORPAY_DOMAIN = 'all-model-ai.com';
    process.env.PAYMENT_MODE = 'live';

    const info = buildCheckoutInfo();
    assert.equal(info.primaryProvider, 'wayforpay');
    assert.equal(info.showTestModeBanner, false);
    assert.equal(info.wayforpayMockCheckout, false);
    assert.equal(info.recurringBillingSupported, false);
    assert.ok(info.renewalNotice);

    process.env.WAYFORPAY_TEST_MODE = prev.testMode;
    process.env.WAYFORPAY_LIVE_CONFIRM = prev.live;
    process.env.WAYFORPAY_MERCHANT_ACCOUNT = prev.account;
    process.env.WAYFORPAY_SECRET_KEY = prev.secret;
    process.env.WAYFORPAY_DOMAIN = prev.domain;
    process.env.PAYMENT_MODE = prev.paymentMode;
    process.env.PAYMENT_PROVIDER = prev.provider;
    process.env.STRIPE_SECRET_KEY = prev.stripeSecret;
    process.env.STRIPE_MODE = prev.stripeMode;
});

test('checkout-info Stripe test banner only when Stripe is primary', () => {
    const prev = {
        provider: process.env.PAYMENT_PROVIDER,
        stripeSecret: process.env.STRIPE_SECRET_KEY,
        stripePk: process.env.STRIPE_PUBLISHABLE_KEY,
        stripeMode: process.env.STRIPE_MODE,
        wfpTest: process.env.WAYFORPAY_TEST_MODE,
    };
    process.env.PAYMENT_PROVIDER = 'stripe';
    process.env.STRIPE_MODE = 'test';
    process.env.STRIPE_SECRET_KEY = 'sk_test_checkout_banner';
    process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test_checkout_banner';
    process.env.WAYFORPAY_TEST_MODE = 'true';

    const info = buildCheckoutInfo();
    assert.equal(info.primaryProvider, 'stripe');
    assert.equal(info.showTestModeBanner, true);
    assert.match(info.testModeBannerText, /Stripe Test Mode/);
    assert.doesNotMatch(info.testModeBannerText || '', /WayForPay/);

    process.env.PAYMENT_PROVIDER = prev.provider;
    process.env.STRIPE_SECRET_KEY = prev.stripeSecret;
    process.env.STRIPE_PUBLISHABLE_KEY = prev.stripePk;
    process.env.STRIPE_MODE = prev.stripeMode;
    process.env.WAYFORPAY_TEST_MODE = prev.wfpTest;
});
