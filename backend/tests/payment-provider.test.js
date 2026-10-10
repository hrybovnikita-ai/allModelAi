const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

process.env.NODE_ENV = 'test';

const app = require('../app');
const { buildCheckoutInfo } = require('../src/payments/checkoutInfo');
const { getPublicCheckoutPlan } = require('../src/payments/checkoutPlans');
const { resolvePrimaryPaymentProvider } = require('../src/payments/paymentProvider');

async function registerAndCookie(email) {
    const res = await request(app)
        .post('/api/auth/register')
        .send({ name: 'Pay Tester', email, password: 'Password123!' });
    assert.equal(res.status, 201);
    return res.headers['set-cookie'];
}

test('Payment provider selection and checkout plans', async (t) => {
    const prev = { ...process.env };

    t.after(() => {
        process.env = prev;
    });

    await t.test('public plan prices are server-defined', () => {
        const pro = getPublicCheckoutPlan('pro');
        const ent = getPublicCheckoutPlan('enterprise');
        assert.equal(pro.amountCents, 1500);
        assert.equal(ent.amountCents, 3000);
        assert.equal(pro.amountDisplay, '15.00');
        assert.equal(ent.amountDisplay, '30.00');
    });

    await t.test('WayForPay is primary when configured without Stripe preference', () => {
        delete process.env.STRIPE_SECRET_KEY;
        delete process.env.STRIPE_CHECKOUT_WHEN_WAYFORPAY;
        delete process.env.PAYMENT_PROVIDER;
        process.env.WAYFORPAY_DOMAIN = 'shop.example.com';
        process.env.WAYFORPAY_TEST_MODE = 'true';
        assert.equal(resolvePrimaryPaymentProvider(), 'wayforpay');
        const info = buildCheckoutInfo();
        assert.equal(info.primaryProvider, 'wayforpay');
        assert.equal(info.wayforpayCheckoutEnabled, true);
        assert.equal(info.stripeCheckoutEnabled, false);
    });

    await t.test('create-intent rejects client amount tampering', async () => {
        process.env.STRIPE_MODE = 'test';
        process.env.STRIPE_SECRET_KEY = 'sk_test_example';
        process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test_example';
        process.env.PAYMENT_PROVIDER = 'stripe';
        delete process.env.WAYFORPAY_DOMAIN;
        const cookie = await registerAndCookie(`tamper-${Date.now()}@example.com`);
        const res = await request(app)
            .post('/api/payments/create-intent')
            .set('Cookie', cookie)
            .send({ plan: 'pro', amount: 100 });
        assert.equal(res.status, 400);
    });

    await t.test('create-intent requires authentication', async () => {
        const res = await request(app).post('/api/payments/create-intent').send({ plan: 'pro' });
        assert.ok(res.status === 401 || res.status === 403);
    });

    await t.test('GET /api/payments/plans/pro returns quote', async () => {
        const res = await request(app).get('/api/payments/plans/pro');
        assert.equal(res.status, 200);
        assert.equal(res.body.amountCents, 1500);
    });
});
