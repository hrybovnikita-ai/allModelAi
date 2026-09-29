const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.DEVELOPER_EMAILS = 'owner@example.com';
delete process.env.STRIPE_SECRET_KEY;

const app = require('../app');

async function registerAndCookie(email) {
    const res = await request(app)
        .post('/api/auth/register')
        .send({ name: 'Pay Tester', email, password: 'Password123!' });
    assert.equal(res.status, 201);
    return res.headers['set-cookie'];
}

test('Payments: developer mock vs user Stripe checkout', async (t) => {
    await t.test('GET /api/payments/config returns stripe flags for authenticated user', async () => {
        const cookie = await registerAndCookie(`cfg-${Date.now()}@example.com`);
        const res = await request(app).get('/api/payments/config').set('Cookie', cookie);
        assert.equal(res.status, 200);
        assert.equal(typeof res.body.stripeConfigured, 'boolean');
    });

    await t.test('POST /api/payments/mock-subscribe activates plan for developer email only', async () => {
        const devEmail = `owner-mock-${Date.now()}@example.com`;
        process.env.DEVELOPER_EMAILS = `${devEmail},owner@example.com`;
        const cookie = await registerAndCookie(devEmail);
        const res = await request(app)
            .post('/api/payments/mock-subscribe')
            .set('Cookie', cookie)
            .send({ plan: 'pro', holder: 'Test', cardNumber: '4242424242424242', email: 'owner@example.com' });
        assert.equal(res.status, 201);
        assert.equal(res.body.mock, true);
        assert.ok(res.body.hasSubscription || res.body.plan);
    });

    await t.test('POST /api/payments/mock-subscribe rejects regular users', async () => {
        const cookie = await registerAndCookie(`user-${Date.now()}@example.com`);
        const res = await request(app)
            .post('/api/payments/mock-subscribe')
            .set('Cookie', cookie)
            .send({ plan: 'pro' });
        assert.equal(res.status, 403);
        assert.equal(res.body.useStripe, true);
    });

    await t.test('POST /api/payments/checkout returns 503 when Stripe is not configured (regular user)', async () => {
        const cookie = await registerAndCookie(`stripe-${Date.now()}@example.com`);
        const res = await request(app)
            .post('/api/payments/checkout')
            .set('Cookie', cookie)
            .send({ plan: 'common' });
        assert.equal(res.status, 503);
        assert.match(res.body.message || '', /STRIPE|Payments/i);
    });

    await t.test('POST /api/payments/checkout gives developer access without Stripe for owner email', async () => {
        const registerRes = await request(app)
            .post('/api/auth/register')
            .send({ name: 'Owner', email: 'owner@example.com', password: 'Password123!' });
        assert.equal(registerRes.status, 201);
        const cookie = registerRes.headers['set-cookie'];
        const res = await request(app)
            .post('/api/payments/checkout')
            .set('Cookie', cookie)
            .send({ plan: 'common' });
        assert.equal(res.status, 201);
        assert.equal(res.body.developerAccess, true);
    });
});
