const { test, after, before } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.FRONTEND_ORIGIN = 'http://localhost:5173';
process.env.CLIENT_URL = 'http://localhost:5173';
process.env.DB_FILE = path.join(os.tmpdir(), `allmodelai-lemon-${process.pid}-${Date.now()}.sqlite`);
process.env.LEMONSQUEEZY_API_KEY = '';
process.env.LEMONSQUEEZY_STORE_ID = '';
process.env.LEMONSQUEEZY_VARIANT_ID = '';
process.env.LEMONSQUEEZY_WEBHOOK_SECRET = 'test-webhook-secret';

const app = require('../app');

after(() => {
    app.locals.db.close();
    fs.rmSync(process.env.DB_FILE, { force: true });
});

test('POST /api/payments/create-checkout returns 503 when Lemon Squeezy is not configured', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/register').send({
        name: 'Lemon User',
        email: `lemon-${Date.now()}@example.com`,
        password: 'LemonPass1!',
    });
    const res = await agent.post('/api/payments/create-checkout').send({ variantId: '2308479' });
    assert.equal(res.status, 503);
    assert.match(res.body.code || '', /LEMONSQUEEZY/);
});

test('webhook rejects invalid signature', async () => {
    const body = JSON.stringify({ meta: { event_name: 'order_created' }, data: { id: '1' } });
    const res = await request(app)
        .post('/api/webhooks/lemonsqueezy')
        .set('Content-Type', 'application/json')
        .set('X-Signature', 'deadbeef')
        .send(body);
    assert.equal(res.status, 401);
});

test('webhook fulfills subscription on subscription_created', async () => {
    process.env.LEMONSQUEEZY_API_KEY = 'test-key';
    process.env.LEMONSQUEEZY_STORE_ID = '499591';
    process.env.LEMONSQUEEZY_VARIANT_ID = '2308479';
    process.env.LEMONSQUEEZY_WEBHOOK_SECRET = 'test-webhook-secret';
    process.env.PAYMENT_PROVIDER = 'lemonsqueezy';

    const email = `lemon-wh-${Date.now()}@example.com`;
    const agent = request.agent(app);
    const registered = await agent.post('/api/auth/register').send({
        name: 'Webhook User',
        email,
        password: 'LemonPass1!',
    });
    const userId = registered.body.user.id;

    const payload = {
        meta: {
            event_name: 'subscription_created',
            custom_data: { user_id: String(userId), email },
            test_mode: true,
        },
        data: {
            id: 'sub_test_1',
            attributes: {
                status: 'active',
                currency: 'USD',
                total: 2000,
            },
        },
    };
    const raw = JSON.stringify(payload);
    const signature = crypto.createHmac('sha256', process.env.LEMONSQUEEZY_WEBHOOK_SECRET)
        .update(raw)
        .digest('hex');

    const wh = await request(app)
        .post('/api/webhooks/lemonsqueezy')
        .set('Content-Type', 'application/json')
        .set('X-Signature', signature)
        .send(raw);
    assert.equal(wh.status, 200);

    const sub = await agent.get('/api/subscription');
    assert.equal(sub.status, 200);
    assert.equal(sub.body.hasSubscription, true);
    assert.notEqual(sub.body.subscriptionStatus, 'free');
});
