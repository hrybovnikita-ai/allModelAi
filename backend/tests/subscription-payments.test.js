const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { signCallbackPayload } = require('../src/wayforpay/crypto');

process.env.NODE_ENV = 'test';
process.env.DEVELOPER_EMAILS = 'dev@example.com';
delete process.env.STRIPE_SECRET_KEY;

const TEST_SECRET = 'dhkq3vUi94{Z!5frxs(02ML';
const app = require('../app');

async function registerAndCookie(email) {
    const res = await request(app)
        .post('/api/auth/register')
        .send({ name: 'Sub Tester', email, password: 'Password123!' });
    assert.equal(res.status, 201);
    return res.headers['set-cookie'];
}

test('Subscription & payment lifecycle', async (t) => {
    const prev = {
        account: process.env.WAYFORPAY_MERCHANT_ACCOUNT,
        secret: process.env.WAYFORPAY_SECRET_KEY,
        domain: process.env.WAYFORPAY_DOMAIN,
        testMode: process.env.WAYFORPAY_TEST_MODE,
        live: process.env.WAYFORPAY_LIVE_CONFIRM,
        backend: process.env.BACKEND_PUBLIC_URL,
    };
    process.env.WAYFORPAY_MERCHANT_ACCOUNT = 'test_merch_n1';
    process.env.WAYFORPAY_SECRET_KEY = TEST_SECRET;
    process.env.WAYFORPAY_DOMAIN = 'all-model-ai.vercel.app';
    process.env.WAYFORPAY_TEST_MODE = 'true';
    process.env.BACKEND_PUBLIC_URL = 'https://api.example.com';

    t.after(() => {
        process.env.WAYFORPAY_MERCHANT_ACCOUNT = prev.account;
        process.env.WAYFORPAY_SECRET_KEY = prev.secret;
        process.env.WAYFORPAY_DOMAIN = prev.domain;
        process.env.WAYFORPAY_TEST_MODE = prev.testMode;
        process.env.WAYFORPAY_LIVE_CONFIRM = prev.live;
        process.env.BACKEND_PUBLIC_URL = prev.backend;
    });

    await t.test('test-checkout sets Pro limit 3000 and metadata', async () => {
        const cookie = await registerAndCookie(`sub-pro-${Date.now()}@example.com`);
        const pay = await request(app)
            .post('/api/payments/wayforpay/test-checkout')
            .set('Cookie', cookie)
            .send({ plan: 'pro' });
        assert.equal(pay.status, 200);
        assert.equal(pay.body.requestLimit, 3000);

        const sub = await request(app).get('/api/subscription').set('Cookie', cookie);
        assert.equal(sub.status, 200);
        assert.equal(sub.body.plan, 'common');
        assert.equal(sub.body.planKey, 'pro');
        assert.equal(sub.body.planSlug, 'pro');
        assert.equal(sub.body.planDisplayName, 'Pro Monthly');
        assert.equal(sub.body.currentPlan, 'Pro Monthly');
        assert.notEqual(sub.body.currentPlan, 'common');
        assert.equal(sub.body.limit, 3000);
        assert.equal(sub.body.remaining, 3000);
        assert.equal(sub.body.paymentProvider, 'wayforpay');
        assert.equal(sub.body.subscriptionStatus, 'active');
        assert.ok(sub.body.orderReference);

        const credits = await request(app).get('/api/credits').set('Cookie', cookie);
        assert.equal(credits.body.planDisplayName, 'Pro Monthly');
        assert.equal(credits.body.subscriptionStatus, 'active');

        const session = await request(app).get('/api/auth/session').set('Cookie', cookie);
        assert.equal(session.status, 200);
        const dbRow = app.locals.db.database.prepare(
            'SELECT plan, status, request_limit FROM subscription_details WHERE email = ?',
        ).get(session.body.user.email);
        assert.equal(dbRow.plan, 'pro');
        assert.equal(dbRow.status, 'active');
        assert.equal(dbRow.request_limit, 3000);
    });

    await t.test('plan labels for week and power test checkout', async () => {
        const weekCookie = await registerAndCookie(`sub-week-${Date.now()}@example.com`);
        await request(app).post('/api/payments/wayforpay/test-checkout').set('Cookie', weekCookie).send({ plan: 'week' });
        const weekCredits = await request(app).get('/api/credits').set('Cookie', weekCookie);
        assert.equal(weekCredits.body.planDisplayName, 'Weekly');
        assert.equal(weekCredits.body.subscriptionStatus, 'active');
        assert.equal(weekCredits.body.remaining, 500);

        const powerCookie = await registerAndCookie(`sub-power-${Date.now()}@example.com`);
        await request(app).post('/api/payments/wayforpay/test-checkout').set('Cookie', powerCookie).send({ plan: 'power' });
        const powerCredits = await request(app).get('/api/credits').set('Cookie', powerCookie);
        assert.equal(powerCredits.body.planDisplayName, 'Power Monthly');
        assert.equal(powerCredits.body.remaining, 12000);
    });

    await t.test('legacy plan=common with 3000 limit migrates to pro slug', async () => {
        const email = `sub-common-migrate-${Date.now()}@example.com`;
        const cookie = await registerAndCookie(email);
        const end = new Date(Date.now() + 86400000 * 20).toISOString();
        app.locals.db.database.prepare(`
            INSERT INTO subscription_details (
                email, plan, billing_interval, request_limit, period_end, status, updated_at
            ) VALUES (?, 'common', 'month', 3000, ?, 'active', ?)
        `).run(email, end, new Date().toISOString());

        const credits = await request(app).get('/api/credits').set('Cookie', cookie);
        assert.equal(credits.body.planKey, 'pro');
        assert.equal(credits.body.currentPlan, 'Pro Monthly');
        const dbRow = app.locals.db.database.prepare('SELECT plan FROM subscription_details WHERE email = ?').get(email);
        assert.equal(dbRow.plan, 'pro');
    });

    await t.test('legacy plan=pro row resolves to Pro Monthly on credits', async () => {
        const email = `sub-legacy-${Date.now()}@example.com`;
        const cookie = await registerAndCookie(email);
        const end = new Date(Date.now() + 86400000 * 20).toISOString();
        app.locals.db.database.prepare(`
            INSERT INTO subscription_details (
                email, plan, billing_interval, request_limit, period_end, status, updated_at,
                payment_provider, payment_status
            ) VALUES (?, 'pro', 'month', 3000, ?, 'active', ?, 'wayforpay', 'successful')
        `).run(email, end, new Date().toISOString());

        const credits = await request(app).get('/api/credits').set('Cookie', cookie);
        assert.equal(credits.body.plan, 'common');
        assert.equal(credits.body.planDisplayName, 'Pro Monthly');
        assert.equal(credits.body.subscriptionStatus, 'active');
        assert.equal(credits.body.remaining, 3000);
    });

    await t.test('cancel test subscription returns to free', async () => {
        const cookie = await registerAndCookie(`sub-cancel-${Date.now()}@example.com`);
        await request(app)
            .post('/api/payments/wayforpay/test-checkout')
            .set('Cookie', cookie)
            .send({ plan: 'week' });
        const cancel = await request(app)
            .post('/api/subscription/cancel-test')
            .set('Cookie', cookie);
        assert.equal(cancel.status, 200);
        assert.equal(cancel.body.plan, 'free');
        assert.equal(cancel.body.limit, 5000);
    });

    await t.test('expired subscription reverts on credits read', async () => {
        const email = `sub-exp-${Date.now()}@example.com`;
        const cookie = await registerAndCookie(email);
        await request(app)
            .post('/api/payments/wayforpay/test-checkout')
            .set('Cookie', cookie)
            .send({ plan: 'common' });
        const past = new Date(Date.now() - 86400000).toISOString();
        app.locals.db.database.prepare('UPDATE subscription_details SET period_end = ? WHERE email = ?').run(past, email);
        const credits = await request(app).get('/api/credits').set('Cookie', cookie);
        assert.equal(credits.status, 200);
        assert.equal(credits.body.plan, 'free');
        assert.equal(credits.body.limit, 5000);
        assert.ok(['free', 'expired'].includes(credits.body.subscriptionStatus));
    });

    await t.test('developer mock subscribe requires DEVELOPER_EMAILS', async () => {
        const cookie = await registerAndCookie(`not-dev-${Date.now()}@example.com`);
        const res = await request(app)
            .post('/api/payments/mock-subscribe')
            .set('Cookie', cookie)
            .send({ plan: 'plus' });
        assert.equal(res.status, 403);
        const devEmail = `dev-only-${Date.now()}@example.com`;
        process.env.DEVELOPER_EMAILS = devEmail;
        const devCookie = await registerAndCookie(devEmail);
        const devRes = await request(app)
            .post('/api/payments/mock-subscribe')
            .set('Cookie', devCookie)
            .send({ plan: 'plus' });
        assert.equal(devRes.status, 201);
        assert.equal(devRes.body.limit, 12000);
    });

    await t.test('live callback: failed payment and invalid signature', async () => {
        process.env.WAYFORPAY_TEST_MODE = 'false';
        process.env.WAYFORPAY_LIVE_CONFIRM = 'true';
        const cookie = await registerAndCookie(`sub-live-${Date.now()}@example.com`);
        const create = await request(app)
            .post('/api/payments/wayforpay/create')
            .set('Cookie', cookie)
            .send({ plan: 'common' });
        assert.equal(create.status, 201);
        const { orderReference, fields } = create.body;

        const badSig = await request(app)
            .post('/api/payments/wayforpay/callback')
            .send({
                merchantAccount: fields.merchantAccount,
                orderReference,
                amount: fields.amount,
                currency: fields.currency,
                authCode: '1',
                cardPan: '42****4242',
                transactionStatus: 'Approved',
                reasonCode: '1100',
                merchantSignature: 'deadbeefdeadbeefdeadbeefdeadbeef',
            });
        assert.equal(badSig.status, 400);

        const declined = await request(app)
            .post('/api/payments/wayforpay/callback')
            .send({
                merchantAccount: fields.merchantAccount,
                orderReference,
                amount: fields.amount,
                currency: fields.currency,
                authCode: '1',
                cardPan: '42****4242',
                transactionStatus: 'Declined',
                reasonCode: '1100',
                merchantSignature: signCallbackPayload({
                    merchantAccount: fields.merchantAccount,
                    orderReference,
                    amount: fields.amount,
                    currency: fields.currency,
                    authCode: '1',
                    cardPan: '42****4242',
                    transactionStatus: 'Declined',
                    reasonCode: '1100',
                }, TEST_SECRET),
            });
        assert.equal(declined.status, 200);
        const credits = await request(app).get('/api/credits').set('Cookie', cookie);
        assert.equal(credits.body.plan, 'free');
    });

    await t.test('TEST MODE blocks external callback', async () => {
        process.env.WAYFORPAY_TEST_MODE = 'true';
        const res = await request(app)
            .post('/api/payments/wayforpay/callback')
            .send({ orderReference: 'x' });
        assert.equal(res.status, 403);
    });

    await t.test('live create blocked while TEST MODE true', async () => {
        process.env.WAYFORPAY_TEST_MODE = 'true';
        const cookie = await registerAndCookie(`sub-block-${Date.now()}@example.com`);
        const create = await request(app)
            .post('/api/payments/wayforpay/create')
            .set('Cookie', cookie)
            .send({ plan: 'common' });
        assert.equal(create.body.mockCheckout, true);
        assert.equal(create.body.payUrl, undefined);
    });
});
