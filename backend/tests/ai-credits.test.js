const { test, after, before } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.AI_CREDITS_ENABLED = 'true';
process.env.DB_FILE = path.join(os.tmpdir(), `allmodelai-ai-credits-${process.pid}-${Date.now()}.sqlite`);
process.env.DEVELOPER_EMAILS = 'credits@example.com';
process.env.ENABLE_PLUS_TEST_MODE = 'true';
process.env.API_KEY = 'test-gateway';
process.env.PAYMENT_PROVIDER = 'stripe';
process.env.STRIPE_SECRET_KEY = 'sk_test_ai_credits_unit';
process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test_ai_credits_unit';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_ai_credits';

const app = require('../app');
const {
    grantCreditsIdempotentAsync,
    deductCreditsAsync,
    readBalanceAsync,
    findLedgerByReferenceAsync,
} = require('../src/billing/aiCreditLedger');
const {
    fulfillAiCreditCheckoutSession,
    handleAiCreditStripeEvent,
} = require('../src/controllers/aiCreditController');
const { checkAiCreditsBeforeChat } = require('../src/billing/aiCreditUsage');
const { getPublicCreditPackages, resolvePackConfig } = require('../src/billing/aiCreditPackages');
const { wasStripeEventProcessed, markStripeEventProcessed } = require('../src/payments/stripeWebhookIdempotency');

after(() => {
    app.locals.db.close();
});

before(async () => {
    const api = request.agent(app);
    await api.post('/api/auth/register').send({
        name: 'Credits User',
        email: 'credits@example.com',
        password: 'test-password',
    });
});

test('public credit packages: four USD tiers with server-defined credits', () => {
    const packages = getPublicCreditPackages();
    assert.equal(packages.length, 4);
    assert.deepEqual(packages.map((p) => p.id), ['starter', 'plus', 'pro', 'ultimate']);
    assert.equal(packages[0].priceDisplay, '$5.00');
    assert.equal(packages[0].creditsIncluded, 500);
    assert.equal(packages[3].creditsIncluded, 6500);
});

test('ledger grant is idempotent and deducts only on success path', async () => {
    const connection = app.locals.db;
    const email = 'credits@example.com';
    const first = await grantCreditsIdempotentAsync(connection, {
        email,
        amount: 100,
        referenceId: 'test_grant_1',
        entryType: 'purchase',
    });
    const dup = await grantCreditsIdempotentAsync(connection, {
        email,
        amount: 100,
        referenceId: 'test_grant_1',
        entryType: 'purchase',
    });
    assert.equal(first.duplicate, false);
    assert.equal(dup.duplicate, true);
    assert.equal(await readBalanceAsync(connection, email), 100);
    const usage = await deductCreditsAsync(connection, {
        email,
        amount: 30,
        referenceId: 'chat_usage_test_1',
        entryType: 'usage',
    });
    assert.equal(usage.balance, 70);
    await assert.rejects(
        () => deductCreditsAsync(connection, {
            email,
            amount: 500,
            referenceId: 'chat_usage_test_2',
        }),
        (error) => error.code === 'AI_CREDITS_EXHAUSTED',
    );
    assert.equal(await readBalanceAsync(connection, email), 70);
});

test('fulfill AI credit checkout validates USD amount and grants credits once', async () => {
    const connection = app.locals.db;
    const starter = resolvePackConfig('starter');
    const session = {
        id: 'cs_test_ai_credits_starter',
        payment_status: 'paid',
        status: 'complete',
        amount_total: starter.priceUsdCents,
        currency: 'usd',
        metadata: {
            purchaseType: 'ai_credit_pack',
            packageId: 'starter',
            credits: String(starter.credits),
            email: 'credits@example.com',
            isTestMode: 'true',
        },
    };
    const grant = await fulfillAiCreditCheckoutSession(connection, session);
    assert.equal(grant.credits, starter.credits);
    assert.equal(await readBalanceAsync(connection, 'credits@example.com'), 70 + starter.credits);
    const again = await fulfillAiCreditCheckoutSession(connection, session);
    assert.equal(again.duplicate, true);
    assert.equal(await readBalanceAsync(connection, 'credits@example.com'), 70 + starter.credits);
});

test('credits are granted only via fulfill (webhook path), not by success URL alone', async () => {
    const connection = app.locals.db;
    const sessionId = 'cs_test_webhook_only';
    const starter = resolvePackConfig('starter');
    const before = await readBalanceAsync(connection, 'credits@example.com');
    assert.equal(await findLedgerByReferenceAsync(connection, `stripe_checkout_${sessionId}`), null);
    await fulfillAiCreditCheckoutSession(connection, {
        id: sessionId,
        payment_status: 'paid',
        status: 'complete',
        amount_total: starter.priceUsdCents,
        currency: 'usd',
        metadata: {
            purchaseType: 'ai_credit_pack',
            packageId: 'starter',
            credits: String(starter.credits),
            email: 'credits@example.com',
        },
    });
    assert.equal(await readBalanceAsync(connection, 'credits@example.com'), before + starter.credits);
    const entry = await findLedgerByReferenceAsync(connection, `stripe_checkout_${sessionId}`);
    assert.ok(entry);
    assert.equal(entry.amount, starter.credits);
});

test('credit checkout endpoint rejects tampered client price and credits', async () => {
    const api = request.agent(app);
    await api.post('/api/auth/login').send({ email: 'credits@example.com', password: 'test-password' });
    const priceTamper = await api.post('/api/payments/credit-checkout').send({
        packageId: 'starter',
        priceUsdCents: 1,
    });
    assert.equal(priceTamper.status, 400);
    assert.equal(priceTamper.body.code, 'AI_CREDIT_PRICE_MISMATCH');
    const creditTamper = await api.post('/api/payments/credit-checkout').send({
        packageId: 'starter',
        credits: 999999,
    });
    assert.equal(creditTamper.status, 400);
    assert.equal(creditTamper.body.code, 'AI_CREDIT_AMOUNT_MISMATCH');
});

test('credit checkout requires authentication', async () => {
    const response = await request(app).post('/api/payments/credit-checkout').send({ packageId: 'starter' });
    assert.equal(response.status, 401);
});

test('stripe webhook rejects missing signature', async () => {
    const response = await request(app)
        .post('/api/payments/webhook')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ id: 'evt_test', type: 'checkout.session.completed' }));
    assert.equal(response.status, 400);
    assert.match(String(response.text), /Webhook Error/i);
});

test('duplicate stripe webhook events are ignored at idempotency layer', async () => {
    const connection = app.locals.db;
    const eventId = `evt_dup_${Date.now()}`;
    assert.equal(await wasStripeEventProcessed(connection, eventId), false);
    await markStripeEventProcessed(connection, eventId, 'checkout.session.completed');
    assert.equal(await wasStripeEventProcessed(connection, eventId), true);
});

test('async payment failed event does not grant credits', async () => {
    const connection = app.locals.db;
    const before = await readBalanceAsync(connection, 'credits@example.com');
    const result = await handleAiCreditStripeEvent(connection, {
        type: 'checkout.session.async_payment_failed',
        data: { object: { id: 'cs_failed_1', metadata: { purchaseType: 'ai_credit_pack' } } },
    });
    assert.equal(result.failed, true);
    assert.equal(await readBalanceAsync(connection, 'credits@example.com'), before);
});

test('chat returns AI_CREDITS_EXHAUSTED without calling AI providers', async () => {
    const api = request.agent(app);
    await api.post('/api/auth/login').send({ email: 'credits@example.com', password: 'test-password' });
    const connection = app.locals.db;
    await deductCreditsAsync(connection, {
        email: 'credits@example.com',
        amount: await readBalanceAsync(connection, 'credits@example.com'),
        referenceId: 'drain_for_test',
    });
    assert.equal(await readBalanceAsync(connection, 'credits@example.com'), 0);
    const originalFetch = global.fetch;
    global.fetch = async () => {
        throw new Error('fetch should not run when credits exhausted');
    };
    try {
        const response = await api.post('/api/chat').send({
            model: 'gemini',
            temporary: true,
            messages: [{ role: 'user', text: 'Hello' }],
        });
        assert.equal(response.status, 402);
        assert.equal(response.body.code, 'AI_CREDITS_EXHAUSTED');
    } finally {
        global.fetch = originalFetch;
    }
});
