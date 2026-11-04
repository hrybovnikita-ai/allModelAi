const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

process.env.NODE_ENV = 'test';

const app = require('../app');
const { getPublicCheckoutPlan } = require('../src/payments/checkoutPlans');
const { subscriptionPlans } = require('../src/billing/plans');
const { resolvePaidCheckoutPlan } = require('../src/payments/paymentIntentPlans');

test('upgrade tier catalog matches billing plans', () => {
    assert.equal(subscriptionPlans.upgrade_plus.amount, 2000);
    assert.equal(subscriptionPlans.upgrade_plus.limit, 2000);
    assert.equal(subscriptionPlans.upgrade_pro_plus.amount, 4000);
    assert.equal(subscriptionPlans.upgrade_pro_plus.limit, 5000);
    assert.equal(subscriptionPlans.upgrade_ultra.amount, 8000);
    assert.equal(subscriptionPlans.upgrade_ultra.limit, 12000);

    const plus = getPublicCheckoutPlan('upgrade-plus');
    assert.equal(plus.amountCents, 2000);
    assert.equal(plus.requestLimit, 2000);

    const proPlus = resolvePaidCheckoutPlan('pro-plus');
    assert.equal(proPlus.planKey, 'upgrade_pro_plus');
    assert.equal(proPlus.amountCents, 4000);
});

test('GET /api/payments/plans/pro-plus returns quote', async () => {
    const res = await request(app).get('/api/payments/plans/pro-plus');
    assert.equal(res.status, 200);
    assert.equal(res.body.slug, 'pro-plus');
    assert.equal(res.body.amountCents, 4000);
    assert.equal(res.body.requestLimit, 5000);
});

test('resolvePaidCheckoutPlan accepts upgrade aliases', () => {
    const { resolvePaidCheckoutPlan, resolveSubscriptionPlanInput } = require('../src/payments/paymentIntentPlans');
    assert.equal(resolvePaidCheckoutPlan('upgrade-pro').planKey, 'upgrade_pro_plus');
    assert.equal(resolvePaidCheckoutPlan('pro-plus').amountCents, 4000);
    assert.equal(resolvePaidCheckoutPlan('pro_plus').planKey, 'upgrade_pro_plus');
    assert.equal(resolveSubscriptionPlanInput('pro-plus').plan.amount, 4000);
    assert.equal(resolvePaidCheckoutPlan('upgrade-ultra').amountCents, 8000);
});
