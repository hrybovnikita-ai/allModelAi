const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

process.env.NODE_ENV = 'test';
delete process.env.STRIPE_SECRET_KEY;
delete process.env.WAYFORPAY_DOMAIN;
process.env.PAYMENT_PROVIDER = 'stripe';

const app = require('../app');
const { stripePriceIdForPlan } = require('../src/payments/stripeMode');
const { resolvePaidCheckoutPlan } = require('../src/payments/paymentIntentPlans');
const { subscriptionPlans, normalizePlanKey } = require('../src/billing/plans');
const { stripeUserMessageFromReport } = require('../src/payments/stripeUserMessages');

async function registerCookie(email) {
    const res = await request(app)
        .post('/api/auth/register')
        .send({ name: 'Stripe Plan', email, password: 'Password123!' });
    assert.equal(res.status, 201);
    return res.headers['set-cookie'];
}

test('Stripe billing plans and config', async (t) => {
    await t.test('plan amounts match Starter / Pro / Unlimited UI', () => {
        assert.equal(subscriptionPlans.starter.amount, 500);
        assert.equal(subscriptionPlans.common.amount, 1500);
        assert.equal(subscriptionPlans.plus.amount, 3000);
        assert.equal(normalizePlanKey('starter'), 'starter');
        assert.equal(normalizePlanKey('unlimited'), 'plus');
    });

    await t.test('resolvePaidCheckoutPlan rejects client amounts', () => {
        const pro = resolvePaidCheckoutPlan('pro');
        assert.equal(pro.amountCents, 1500);
        assert.equal(resolvePaidCheckoutPlan('invalid'), null);
    });

    await t.test('stripePriceIdForPlan reads env aliases', () => {
        const prev = {
            s: process.env.STRIPE_PRICE_STARTER,
            p: process.env.STRIPE_PRICE_PRO,
            u: process.env.STRIPE_PRICE_UNLIMITED,
        };
        process.env.STRIPE_PRICE_STARTER = 'price_starter_test';
        process.env.STRIPE_PRICE_PRO = 'price_pro_test';
        process.env.STRIPE_PRICE_UNLIMITED = 'price_unlimited_test';
        assert.equal(stripePriceIdForPlan('starter'), 'price_starter_test');
        assert.equal(stripePriceIdForPlan('common'), 'price_pro_test');
        assert.equal(stripePriceIdForPlan('plus'), 'price_unlimited_test');
        process.env.STRIPE_PRICE_STARTER = prev.s;
        process.env.STRIPE_PRICE_PRO = prev.p;
        process.env.STRIPE_PRICE_UNLIMITED = prev.u;
    });

    await t.test('user-facing message hides env var names', () => {
        const msg = stripeUserMessageFromReport({ ok: false, code: 'STRIPE_NOT_CONFIGURED' });
        assert.ok(msg);
        assert.doesNotMatch(msg, /STRIPE_/);
    });

    await t.test('POST /api/payments/checkout requires auth', async () => {
        const res = await request(app).post('/api/payments/checkout').send({ plan: 'starter' });
        assert.ok(res.status === 401 || res.status === 403);
    });

    await t.test('POST /api/payments/checkout returns userMessage when Stripe missing', async () => {
        const cookie = await registerCookie(`stripe-plans-${Date.now()}@example.com`);
        const res = await request(app)
            .post('/api/payments/checkout')
            .set('Cookie', cookie)
            .send({ plan: 'starter' });
        assert.equal(res.status, 503);
        assert.ok(res.body.userMessage);
        assert.doesNotMatch(res.body.userMessage, /STRIPE_SECRET/);
        assert.ok(Array.isArray(res.body.missingEnvVars));
    });

    await t.test('GET /api/payments/plans lists starter pro unlimited', async () => {
        const res = await request(app).get('/api/payments/plans');
        assert.equal(res.status, 200);
        assert.ok(res.body.plans.starter);
        assert.ok(res.body.plans.pro);
        assert.ok(res.body.plans.unlimited);
        assert.equal(res.body.plans.pro.amountCents, 1500);
    });
});
