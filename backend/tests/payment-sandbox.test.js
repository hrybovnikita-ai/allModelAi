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
    };
    process.env.WAYFORPAY_TEST_MODE = 'false';
    process.env.WAYFORPAY_LIVE_CONFIRM = 'true';
    process.env.WAYFORPAY_MERCHANT_ACCOUNT = 'live_merch';
    process.env.WAYFORPAY_SECRET_KEY = 'secret';
    process.env.WAYFORPAY_DOMAIN = 'all-model-ai.com';
    process.env.PAYMENT_MODE = 'live';

    const info = buildCheckoutInfo();
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
});
