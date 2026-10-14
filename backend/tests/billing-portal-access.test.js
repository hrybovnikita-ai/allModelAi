const test = require('node:test');
const assert = require('node:assert/strict');
const {
    analyzeBillingPortalAccess,
    isInternalMockBilling,
    isRealStripeCustomerId,
} = require('../src/payments/billingPortalAccess');

test('billing portal access helpers', async (t) => {
    await t.test('isRealStripeCustomerId accepts cus_ prefix only', () => {
        assert.equal(isRealStripeCustomerId('cus_abc123'), true);
        assert.equal(isRealStripeCustomerId('mock_dev_customer'), false);
        assert.equal(isRealStripeCustomerId(''), false);
    });

    await t.test('internal mock billing is detected', () => {
        assert.equal(isInternalMockBilling({ stripeCustomerId: 'mock_dev_customer' }), true);
        assert.equal(isInternalMockBilling({ stripeSubscriptionId: 'mock_dev_sub_1' }), true);
        assert.equal(isInternalMockBilling({ stripeCustomerId: 'cus_real' }), false);
    });

    await t.test('stripe customer enables portal', () => {
        const result = analyzeBillingPortalAccess(
            { paymentProvider: 'stripe', stripeCustomerId: 'cus_test123' },
            { hasSubscription: true, active: true },
        );
        assert.equal(result.canManageStripeBilling, true);
        assert.equal(result.billingManagementCode, 'STRIPE_PORTAL');
    });

    await t.test('mock dev subscription explains internal billing', () => {
        const result = analyzeBillingPortalAccess(
            { stripeCustomerId: 'mock_dev_customer', stripeSubscriptionId: 'mock_dev_sub_x' },
            { hasSubscription: true, active: true },
        );
        assert.equal(result.canManageStripeBilling, false);
        assert.equal(result.billingManagementCode, 'INTERNAL_DEV_SUBSCRIPTION');
        assert.match(result.billingManagementMessage, /developer|internal/i);
    });

    await t.test('wayforpay subscription blocks stripe portal', () => {
        const result = analyzeBillingPortalAccess(
            { paymentProvider: 'wayforpay', stripeSubscriptionId: 'wayforpay_abc' },
            { hasSubscription: true, active: true },
        );
        assert.equal(result.canManageStripeBilling, false);
        assert.equal(result.billingManagementCode, 'WAYFORPAY_SUBSCRIPTION');
    });

    await t.test('stripe provider without customer id', () => {
        const result = analyzeBillingPortalAccess(
            { paymentProvider: 'stripe', stripeSubscriptionId: 'sub_123' },
            { hasSubscription: true, active: true },
        );
        assert.equal(result.canManageStripeBilling, false);
        assert.equal(result.billingManagementCode, 'STRIPE_CUSTOMER_MISSING');
    });
});
