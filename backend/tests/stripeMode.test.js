const test = require('node:test');
const assert = require('node:assert/strict');

const {
    assertStripeCheckoutAllowed,
    getStripeMode,
    shouldPreferStripeOverWayforpay,
} = require('../src/payments/stripeMode');
const { buildCheckoutInfo } = require('../src/payments/checkoutInfo');

test('stripeMode guards test vs live keys', async (t) => {
    const prev = { ...process.env };

    t.after(() => {
        process.env = prev;
    });

    await t.test('blocks live secret when STRIPE_MODE=test', () => {
        process.env.STRIPE_MODE = 'test';
        process.env.STRIPE_SECRET_KEY = 'sk_live_should_not_work';
        process.env.NODE_ENV = 'development';
        const result = assertStripeCheckoutAllowed();
        assert.equal(result.ok, false);
        assert.match(result.message, /STRIPE_MODE=test/i);
    });

    await t.test('allows sk_test in test mode', () => {
        process.env.STRIPE_MODE = 'test';
        process.env.STRIPE_SECRET_KEY = 'sk_test_example';
        process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test_example';
        process.env.NODE_ENV = 'development';
        const result = assertStripeCheckoutAllowed();
        assert.equal(result.ok, true);
        assert.equal(getStripeMode(), 'test');
    });

    await t.test('prefers Stripe over WayForPay when STRIPE_MODE=test', () => {
        process.env.STRIPE_MODE = 'test';
        assert.equal(shouldPreferStripeOverWayforpay(), true);
    });

    await t.test('checkout-info selects Stripe in test mode when keys are valid', () => {
        process.env.STRIPE_MODE = 'test';
        process.env.STRIPE_SECRET_KEY = 'sk_test_example';
        process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test_example';
        const info = buildCheckoutInfo();
        assert.equal(info.primaryProvider, 'stripe');
        assert.equal(info.stripeTestMode, true);
        assert.equal(info.showStripeTestCardHint, true);
    });
});
