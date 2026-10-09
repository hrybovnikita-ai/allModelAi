const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const crypto = require('node:crypto');
const {
    signPurchaseRequest,
    signCallbackPayload,
    verifyCallbackSignature,
    buildCallbackAcceptResponse,
} = require('../src/wayforpay/crypto');

process.env.NODE_ENV = 'test';
process.env.DEVELOPER_EMAILS = 'owner@example.com';
delete process.env.STRIPE_SECRET_KEY;

const TEST_SECRET = 'dhkq3vUi94{Z!5frxs(02ML';
const TEST_MERCHANT = 'test_merchant';

test('WayForPay purchase signature is stable for a known payload', () => {
    const payload = {
        merchantAccount: 'test_merch_n1',
        merchantDomainName: 'all-model-ai.vercel.app',
        orderReference: 'DH783023',
        orderDate: '1415379863',
        amount: '19.00',
        currency: 'USD',
        productName: ['AllModelAI Pro Monthly'],
        productCount: ['1'],
        productPrice: ['19.00'],
    };
    const signature = signPurchaseRequest(payload, TEST_SECRET);
    assert.match(signature, /^[a-f0-9]{32}$/);
    assert.equal(signPurchaseRequest(payload, TEST_SECRET), signature);
});

test('WayForPay callback signature verification', () => {
    const callback = {
        merchantAccount: TEST_MERCHANT,
        orderReference: 'order-1',
        amount: '19.00',
        currency: 'USD',
        authCode: '123456',
        cardPan: '42****4242',
        transactionStatus: 'Approved',
        reasonCode: '1100',
    };
    callback.merchantSignature = signCallbackPayload(callback, TEST_SECRET);
    assert.equal(verifyCallbackSignature(callback, TEST_SECRET), true);
    assert.equal(verifyCallbackSignature({ ...callback, merchantSignature: 'bad' }, TEST_SECRET), false);
});

test('WayForPay gateway accept response signature', () => {
    const body = buildCallbackAcceptResponse('order-abc', TEST_SECRET);
    assert.equal(body.status, 'accept');
    assert.equal(body.orderReference, 'order-abc');
    const expected = crypto.createHmac('md5', TEST_SECRET)
        .update(`${body.orderReference};${body.status};${body.time}`, 'utf8')
        .digest('hex');
    assert.equal(body.signature, expected);
});

const app = require('../app');

async function registerAndCookie(email) {
    const res = await request(app)
        .post('/api/auth/register')
        .send({ name: 'WFP Tester', email, password: 'Password123!' });
    assert.equal(res.status, 201);
    return res.headers['set-cookie'];
}

async function registerSandboxCheckoutCookie(email) {
    const normalized = String(email).trim().toLowerCase();
    process.env.PAYMENT_OWNER_EMAILS = normalized;
    return registerAndCookie(email);
}

test('WayForPay HTTP integration', async (t) => {
    const prev = {
        account: process.env.WAYFORPAY_MERCHANT_ACCOUNT,
        secret: process.env.WAYFORPAY_SECRET_KEY,
        domain: process.env.WAYFORPAY_DOMAIN,
        backend: process.env.BACKEND_PUBLIC_URL,
        testMode: process.env.WAYFORPAY_TEST_MODE,
        paymentOwners: process.env.PAYMENT_OWNER_EMAILS,
    };
    process.env.WAYFORPAY_MERCHANT_ACCOUNT = 'test_merch_n1';
    process.env.WAYFORPAY_SECRET_KEY = TEST_SECRET;
    process.env.WAYFORPAY_DOMAIN = 'all-model-ai.vercel.app';
    process.env.WAYFORPAY_CURRENCY = 'USD';
    process.env.BACKEND_PUBLIC_URL = 'https://api.example.com';

    t.after(() => {
        process.env.WAYFORPAY_MERCHANT_ACCOUNT = prev.account;
        process.env.WAYFORPAY_SECRET_KEY = prev.secret;
        process.env.WAYFORPAY_DOMAIN = prev.domain;
        process.env.BACKEND_PUBLIC_URL = prev.backend;
        process.env.WAYFORPAY_TEST_MODE = prev.testMode;
        process.env.PAYMENT_OWNER_EMAILS = prev.paymentOwners;
    });

    await t.test('TEST MODE create rejects non-owner accounts', async () => {
        process.env.WAYFORPAY_TEST_MODE = 'true';
        const cookie = await registerAndCookie(`wfp-deny-${Date.now()}@example.com`);
        const res = await request(app)
            .post('/api/payments/wayforpay/create')
            .set('Cookie', cookie)
            .send({ plan: 'week' });
        assert.equal(res.status, 403);
        assert.equal(res.body.code, 'PAYMENT_SANDBOX_FORBIDDEN');
    });

    await t.test('TEST MODE create returns mock checkout without payUrl', async () => {
        process.env.WAYFORPAY_TEST_MODE = 'true';
        const cookie = await registerSandboxCheckoutCookie(`wfp-mock-${Date.now()}@example.com`);
        const res = await request(app)
            .post('/api/payments/wayforpay/create')
            .set('Cookie', cookie)
            .send({ plan: 'week' });
        assert.equal(res.status, 201);
        assert.equal(res.body.mockCheckout, true);
        assert.equal(res.body.payUrl, undefined);
        assert.ok(res.body.orderReference);
    });

    await t.test('test-checkout creates mock transaction and activates plan in one request', async () => {
        process.env.WAYFORPAY_TEST_MODE = 'true';
        const email = `wfp-test-checkout-${Date.now()}@example.com`;
        const cookie = await registerSandboxCheckoutCookie(email);
        const res = await request(app)
            .post('/api/payments/wayforpay/test-checkout')
            .set('Cookie', cookie)
            .send({ plan: 'pro' });
        assert.equal(res.status, 200);
        assert.equal(res.body.success, true);
        assert.equal(res.body.paid, true);
        assert.equal(res.body.plan, 'common');
        assert.equal(res.body.requestLimit, 3000);
        assert.match(res.body.message, /Test payment successful/);

        const credits = await request(app).get('/api/credits').set('Cookie', cookie);
        assert.equal(credits.status, 200);
        assert.equal(credits.body.plan, 'common');
        assert.equal(credits.body.limit, 3000);
    });

    await t.test('mock-complete simulates callback and activates plan', async () => {
        process.env.WAYFORPAY_TEST_MODE = 'true';
        const email = `wfp-mock-paid-${Date.now()}@example.com`;
        const cookie = await registerSandboxCheckoutCookie(email);
        const createRes = await request(app)
            .post('/api/payments/wayforpay/create')
            .set('Cookie', cookie)
            .send({ plan: 'common' });
        assert.equal(createRes.status, 201);
        const { orderReference } = createRes.body;

        const mockRes = await request(app)
            .post('/api/payments/wayforpay/mock-complete')
            .set('Cookie', cookie)
            .send({ orderReference });
        assert.equal(mockRes.status, 200);
        assert.equal(mockRes.body.paid, true);

        const credits = await request(app).get('/api/credits').set('Cookie', cookie);
        assert.equal(credits.body.plan, 'common');

        const mockRes2 = await request(app)
            .post('/api/payments/wayforpay/mock-complete')
            .set('Cookie', cookie)
            .send({ orderReference });
        assert.equal(mockRes2.status, 200);
        assert.equal(mockRes2.body.alreadyProcessed, true);
        const purchases = app.locals.db.read().purchases.filter((p) => p.email === email && p.plan === 'common');
        assert.equal(purchases.length, 1);
    });

    await t.test('live create returns signed checkout when TEST MODE is off', async () => {
        process.env.WAYFORPAY_TEST_MODE = 'false';
        process.env.WAYFORPAY_LIVE_CONFIRM = 'true';
        const cookie = await registerAndCookie(`wfp-live-${Date.now()}@example.com`);
        const res = await request(app)
            .post('/api/payments/wayforpay/create')
            .set('Cookie', cookie)
            .send({ plan: 'pro' });
        assert.equal(res.status, 201);
        assert.equal(res.body.mockCheckout, false);
        assert.equal(res.body.payUrl, 'https://secure.wayforpay.com/pay');
        assert.ok(res.body.fields.merchantSignature);
    });

    await t.test('callback activates subscription once (live path)', async () => {
        process.env.WAYFORPAY_TEST_MODE = 'false';
        process.env.WAYFORPAY_LIVE_CONFIRM = 'true';
        const email = `wfp-paid-${Date.now()}@example.com`;
        const cookie = await registerAndCookie(email);
        const createRes = await request(app)
            .post('/api/payments/wayforpay/create')
            .set('Cookie', cookie)
            .send({ plan: 'common' });
        assert.equal(createRes.status, 201);
        const { orderReference, fields } = createRes.body;

        const callbackPayload = {
            merchantAccount: fields.merchantAccount,
            orderReference,
            amount: fields.amount,
            currency: fields.currency,
            authCode: '111111',
            cardPan: '42****4242',
            transactionStatus: 'Approved',
            reasonCode: '1100',
        };
        callbackPayload.merchantSignature = signCallbackPayload(callbackPayload, TEST_SECRET);

        const cb1 = await request(app)
            .post('/api/payments/wayforpay/callback')
            .send(callbackPayload);
        assert.equal(cb1.status, 200);
        assert.equal(cb1.body.status, 'accept');
    });

    await t.test('callback rejects invalid signature', async () => {
        process.env.WAYFORPAY_TEST_MODE = 'false';
        process.env.WAYFORPAY_LIVE_CONFIRM = 'true';
        const res = await request(app)
            .post('/api/payments/wayforpay/callback')
            .send({
                merchantAccount: 'test_merch_n1',
                orderReference: 'missing-order',
                amount: '19.00',
                currency: 'USD',
                authCode: '1',
                cardPan: '42****4242',
                transactionStatus: 'Approved',
                reasonCode: '1100',
                merchantSignature: 'deadbeef',
            });
        assert.equal(res.status, 400);
    });

    await t.test('external callback blocked in test mode', async () => {
        process.env.WAYFORPAY_TEST_MODE = 'true';
        const res = await request(app)
            .post('/api/payments/wayforpay/callback')
            .send({ orderReference: 'x' });
        assert.equal(res.status, 403);
    });
});
