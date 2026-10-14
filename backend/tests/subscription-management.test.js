const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

process.env.NODE_ENV = 'test';
process.env.PAYMENT_PROVIDER = 'stripe';
process.env.STRIPE_MODE = 'test';
process.env.STRIPE_SECRET_KEY = 'sk_test_subscription_management';
process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test_subscription_management';
process.env.STRIPE_PRICE_PRO = 'price_test_pro';
process.env.DB_FILE = path.join(os.tmpdir(), `allmodelai-sub-mgmt-${process.pid}.sqlite`);
fs.rmSync(process.env.DB_FILE, { force: true });

const { activateSubscription } = require('../src/billing/subscriptions');
const { createStripeBillingPortalUrl } = require('../src/payments/stripeBillingPortal');

const app = require('../app');

async function registerAndCookie(email) {
    const res = await request(app)
        .post('/api/auth/register')
        .send({ name: 'Portal Tester', email, password: 'Password123!' });
    assert.equal(res.status, 201);
    return res.headers['set-cookie'];
}

test('Subscription management & billing portal', async (t) => {
    await t.test('checkout returns 409 with useBillingPortal for same active plan', async () => {
        const email = `portal-409-${Date.now()}@example.com`;
        const cookie = await registerAndCookie(email);
        const end = new Date(Date.now() + 86400000 * 30).toISOString();
        activateSubscription(app.locals.db, {
            email,
            name: 'Portal Tester',
            planKey: 'pro',
            stripeCustomerId: 'cus_test409',
            stripeSubscriptionId: 'sub_test409',
            paymentProvider: 'stripe',
            paymentStatus: 'test_paid',
            isTestPayment: true,
        });
        app.locals.db.database.prepare('UPDATE subscription_details SET period_end = ? WHERE email = ?').run(end, email);

        const conflict = await request(app)
            .post('/api/payments/checkout')
            .set('Cookie', cookie)
            .send({ plan: 'pro', embedded: true });
        assert.equal(conflict.status, 409);
        assert.equal(conflict.body.code, 'SUBSCRIPTION_ALREADY_ACTIVE');
        assert.equal(conflict.body.useBillingPortal, true);
    });

    await t.test('subscription summary exposes canManageStripeBilling for stripe customer', async () => {
        const email = `portal-summary-${Date.now()}@example.com`;
        const cookie = await registerAndCookie(email);
        activateSubscription(app.locals.db, {
            email,
            planKey: 'pro',
            stripeCustomerId: 'cus_summary',
            stripeSubscriptionId: 'sub_summary',
            paymentProvider: 'stripe',
        });
        const sub = await request(app).get('/api/subscription').set('Cookie', cookie);
        assert.equal(sub.status, 200);
        assert.equal(sub.body.canManageStripeBilling, true);
        assert.equal(sub.body.stripeCustomerLinked, true);
    });

    await t.test('billing portal rejects internal mock subscription', async () => {
        const email = `portal-mock-${Date.now()}@example.com`;
        const cookie = await registerAndCookie(email);
        activateSubscription(app.locals.db, {
            email,
            planKey: 'pro',
            stripeCustomerId: 'mock_dev_customer',
            stripeSubscriptionId: 'mock_dev_sub_test',
        });
        const sub = await request(app).get('/api/subscription').set('Cookie', cookie);
        assert.equal(sub.body.canManageStripeBilling, false);
        assert.equal(sub.body.billingManagementCode, 'INTERNAL_DEV_SUBSCRIPTION');
        assert.equal(sub.body.manageInternalDevSubscription, true);

        const portal = await request(app)
            .post('/api/payments/billing-portal')
            .set('Cookie', cookie);
        assert.equal(portal.status, 400);
        assert.equal(portal.body.code, 'INTERNAL_DEV_SUBSCRIPTION');
        assert.ok(portal.body.userMessage);
    });

    await t.test('billing portal requires authentication', async () => {
        const res = await request(app).post('/api/payments/billing-portal');
        assert.equal(res.status, 401);
    });

    await t.test('createStripeBillingPortalUrl uses stripe client', async () => {
        let captured;
        const fakeStripe = {
            billingPortal: {
                sessions: {
                    create: async (payload) => {
                        captured = payload;
                        return { url: 'https://billing.stripe.com/p/session/test_abc' };
                    },
                },
            },
        };
        const url = await createStripeBillingPortalUrl(fakeStripe, {
            customerId: 'cus_unit',
            returnUrl: 'https://app.example/dashboard',
        });
        assert.equal(url, 'https://billing.stripe.com/p/session/test_abc');
        assert.deepEqual(captured, {
            customer: 'cus_unit',
            return_url: 'https://app.example/dashboard',
        });
    });

    await t.test('cancel-test ends internal mock dev subscription', async () => {
        const email = `portal-cancel-mock-${Date.now()}@example.com`;
        const cookie = await registerAndCookie(email);
        activateSubscription(app.locals.db, {
            email,
            planKey: 'pro',
            stripeCustomerId: 'mock_dev_customer',
            stripeSubscriptionId: 'mock_dev_sub_cancel',
        });
        const cancel = await request(app)
            .post('/api/subscription/cancel-test')
            .set('Cookie', cookie);
        assert.equal(cancel.status, 200);
        assert.equal(cancel.body.plan, 'free');
    });
});
