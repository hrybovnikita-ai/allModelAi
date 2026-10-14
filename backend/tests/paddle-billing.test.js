const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { EventName } = require('@paddle/paddle-node-sdk');

process.env.NODE_ENV = 'test';
process.env.DB_FILE = path.join(os.tmpdir(), `allmodelai-paddle-${process.pid}.sqlite`);
fs.rmSync(process.env.DB_FILE, { force: true });

const app = require('../app');
const { resolvePrimaryPaymentProvider, listAvailableCheckoutProviders } = require('../src/payments/paymentProvider');
const { processPaddleWebhookEvent } = require('../src/payments/paddleWebhookEvents');
const { wasPaddleEventProcessed, markPaddleEventProcessed } = require('../src/payments/paddleWebhookIdempotency');
const paddleClient = require('../src/payments/paddleClient');

async function registerAndCookie(email) {
    const res = await request(app)
        .post('/api/auth/register')
        .send({ name: 'Paddle Tester', email, password: 'Password123!' });
    assert.equal(res.status, 201);
    return res.headers['set-cookie'];
}

test('Paddle Billing sandbox integration', async (t) => {
    const prev = { ...process.env };

    t.after(() => {
        process.env = prev;
        paddleClient.resetPaddleClientForTests();
    });

    await t.test('provider list keeps Stripe and WayForPay when Paddle unset', () => {
        delete process.env.PADDLE_API_KEY;
        delete process.env.PADDLE_CLIENT_TOKEN;
        delete process.env.PADDLE_WEBHOOK_SECRET;
        process.env.STRIPE_MODE = 'test';
        process.env.STRIPE_SECRET_KEY = 'sk_test_paddle_compat';
        process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test_paddle_compat';
        process.env.PAYMENT_PROVIDER = 'stripe';
        delete process.env.WAYFORPAY_DOMAIN;
        assert.equal(resolvePrimaryPaymentProvider(), 'stripe');
        assert.ok(listAvailableCheckoutProviders().includes('stripe'));
        assert.ok(!listAvailableCheckoutProviders().includes('paddle'));
    });

    await t.test('paddle checkout rejects client-supplied price id', async () => {
        process.env.PADDLE_ENV = 'sandbox';
        process.env.PADDLE_API_KEY = 'pdl_test_api';
        process.env.PADDLE_CLIENT_TOKEN = 'test_client_token';
        process.env.PADDLE_WEBHOOK_SECRET = 'whsec_test';
        process.env.PADDLE_PRICE_PRO = 'pri_test_pro';
        process.env.PADDLE_PRICE_STARTER = 'pri_test_starter';
        process.env.PADDLE_PRICE_UNLIMITED = 'pri_test_unlimited';
        paddleClient.resetPaddleClientForTests();
        const cookie = await registerAndCookie(`paddle-tamper-${Date.now()}@example.com`);
        const res = await request(app)
            .post('/api/payments/paddle/checkout')
            .set('Cookie', cookie)
            .send({ plan: 'pro', priceId: 'pri_evil' });
        assert.equal(res.status, 400);
        assert.equal(res.body.code, 'CLIENT_PRICE_FORBIDDEN');
    });

    await t.test('webhook rejects missing signature', async () => {
        const res = await request(app)
            .post('/api/payments/paddle/webhook')
            .set('Content-Type', 'application/json')
            .send('{}');
        assert.equal(res.status, 400);
    });

    await t.test('webhook verifies signature via Paddle SDK helper', async () => {
        const originalGet = paddleClient.getPaddleClient;
        paddleClient.getPaddleClient = () => ({
            webhooks: {
                unmarshal: async () => ({
                    eventId: 'evt_paddle_sig_1',
                    eventType: EventName.SubscriptionActivated,
                    data: {
                        id: 'sub_paddle_1',
                        status: 'active',
                        customerId: 'ctm_test',
                        customData: { email: 'paddle-webhook@example.com', planKey: 'pro' },
                    },
                }),
            },
        });
        const res = await request(app)
            .post('/api/payments/paddle/webhook')
            .set('Content-Type', 'application/json')
            .set('paddle-signature', 'test_sig')
            .send(JSON.stringify({ event_id: 'evt_paddle_sig_1' }));
        assert.equal(res.status, 200);
        assert.equal(res.body.received, true);
        paddleClient.getPaddleClient = originalGet;
    });

    await t.test('duplicate paddle webhook is ignored', async () => {
        const connection = app.locals.db;
        const eventId = `evt_dup_${Date.now()}`;
        assert.equal(await wasPaddleEventProcessed(connection, eventId), false);
        await markPaddleEventProcessed(connection, eventId, 'subscription.activated');
        assert.equal(await wasPaddleEventProcessed(connection, eventId), true);
    });

    await t.test('subscription.activated grants access only via webhook handler', async () => {
        const email = `paddle-active-${Date.now()}@example.com`;
        await processPaddleWebhookEvent(app.locals.db, {
            eventType: EventName.SubscriptionActivated,
            data: {
                id: 'sub_act_1',
                status: 'active',
                customerId: 'ctm_act',
                customData: { email, planKey: 'pro', userName: 'Paddle User' },
            },
        });
        const row = app.locals.db.database.prepare(
            'SELECT plan, status, payment_provider FROM subscription_details WHERE email = ?',
        ).get(email);
        assert.equal(row.plan, 'pro');
        assert.equal(row.status, 'active');
        assert.equal(row.payment_provider, 'paddle');
    });

    await t.test('subscription.canceled reverts to free', async () => {
        const email = `paddle-cancel-${Date.now()}@example.com`;
        await processPaddleWebhookEvent(app.locals.db, {
            eventType: EventName.SubscriptionActivated,
            data: {
                id: 'sub_cancel_1',
                status: 'active',
                customerId: 'ctm_cancel',
                customData: { email, planKey: 'pro' },
            },
        });
        await processPaddleWebhookEvent(app.locals.db, {
            eventType: EventName.SubscriptionCanceled,
            data: { id: 'sub_cancel_1', status: 'canceled' },
        });
        const row = app.locals.db.database.prepare(
            'SELECT plan, status FROM subscription_details WHERE email = ?',
        ).get(email);
        assert.equal(row.plan, 'free');
        assert.equal(row.status, 'canceled');
    });

    await t.test('transaction.payment_failed marks past_due', async () => {
        const email = `paddle-fail-${Date.now()}@example.com`;
        await processPaddleWebhookEvent(app.locals.db, {
            eventType: EventName.SubscriptionActivated,
            data: {
                id: 'sub_fail_1',
                status: 'active',
                customerId: 'ctm_fail',
                customData: { email, planKey: 'starter' },
            },
        });
        await processPaddleWebhookEvent(app.locals.db, {
            eventType: EventName.TransactionPaymentFailed,
            data: { subscriptionId: 'sub_fail_1' },
        });
        const row = app.locals.db.database.prepare(
            'SELECT status, payment_status FROM subscription_details WHERE email = ?',
        ).get(email);
        assert.equal(row.status, 'past_due');
        assert.equal(row.payment_status, 'failed');
    });
});
