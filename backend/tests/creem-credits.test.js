const { test, after, before } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.AI_CREDITS_ENABLED = 'true';
process.env.DB_FILE = path.join(os.tmpdir(), `allmodelai-creem-${process.pid}-${Date.now()}.sqlite`);
process.env.DEVELOPER_EMAILS = 'creem@example.com';
process.env.API_KEY = 'test-gateway';
process.env.CREEM_WEBHOOK_SECRET = 'whsec_creem_test';
process.env.CREEM_API_KEY = 'creem_test_api_key';
process.env.CREEM_CHECKOUT_ENABLED = 'false';
process.env.CREEM_ALLOW_LIVE_CHECKOUT = 'false';

const app = require('../app');
const { verifyCreemWebhookSignature } = require('../src/payments/creemWebhookVerify');
const {
    wasCreemEventProcessed,
    markCreemEventProcessed,
    claimCreemEvent,
    releaseCreemEventClaim,
} = require('../src/payments/creemWebhookIdempotency');
const {
    handleCreemCheckoutCompleted,
    handleCreemRefundCreated,
} = require('../src/controllers/creemController');
const {
    assertCreemCheckoutAllowed,
    isCreemLiveApiKey,
} = require('../src/payments/creemConfig');
const {
    isCreemModerationEnabled,
    screenPromptWithCreem,
} = require('../src/payments/creemModeration');
const {
    readBalanceAsync,
    readWalletSummaryAsync,
    grantCreditsIdempotentAsync,
    deductCreditsAsync,
} = require('../src/billing/aiCreditLedger');
const { resolvePackConfig } = require('../src/billing/aiCreditPackages');

function signCreemBody(body, secret = process.env.CREEM_WEBHOOK_SECRET) {
    return crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex');
}

after(() => {
    app.locals.db.close();
});

before(async () => {
    const api = request.agent(app);
    await api.post('/api/auth/register').send({
        name: 'Creem User',
        email: 'creem@example.com',
        password: 'test-password',
    });
});

test('Creem live checkout stays disabled by default', () => {
    const guard = assertCreemCheckoutAllowed();
    assert.equal(guard.ok, false);
    assert.equal(guard.code, 'CREEM_CHECKOUT_DISABLED');
});

test('Creem live API key is blocked without CREEM_ALLOW_LIVE_CHECKOUT', () => {
    const previousKey = process.env.CREEM_API_KEY;
    const previousEnabled = process.env.CREEM_CHECKOUT_ENABLED;
    const previousTestMode = process.env.CREEM_TEST_MODE;
    process.env.CREEM_API_KEY = 'creem_live_example_key';
    process.env.CREEM_CHECKOUT_ENABLED = 'true';
    process.env.CREEM_TEST_MODE = 'false';
    try {
        assert.equal(isCreemLiveApiKey(), true);
        const guard = assertCreemCheckoutAllowed();
        assert.equal(guard.ok, false);
        assert.equal(guard.code, 'CREEM_LIVE_BLOCKED');
    } finally {
        process.env.CREEM_API_KEY = previousKey;
        process.env.CREEM_CHECKOUT_ENABLED = previousEnabled;
        if (previousTestMode == null) delete process.env.CREEM_TEST_MODE;
        else process.env.CREEM_TEST_MODE = previousTestMode;
    }
});

test('Creem credit checkout requires authentication', async () => {
    const response = await request(app)
        .post('/api/payments/creem/credit-checkout')
        .send({ packageId: 'starter' });
    assert.equal(response.status, 401);
});

test('Creem credit checkout rejects invalid package id when authenticated', async () => {
    const api = request.agent(app);
    await api.post('/api/auth/login').send({ email: 'creem@example.com', password: 'test-password' });
    const response = await api.post('/api/payments/creem/credit-checkout').send({ packageId: 'invalid-pack' });
    assert.equal(response.status, 400);
    assert.equal(response.body.code, 'AI_CREDIT_PACKAGE_INVALID');
});

test('Creem credit checkout returns 503 while merchant approval pending', async () => {
    const api = request.agent(app);
    await api.post('/api/auth/login').send({ email: 'creem@example.com', password: 'test-password' });
    const response = await api.post('/api/payments/creem/credit-checkout').send({ packageId: 'starter' });
    assert.equal(response.status, 503);
    assert.equal(response.body.code, 'CREEM_CHECKOUT_DISABLED');
    assert.equal(response.body.merchantApprovalPending, true);
});

test('wallet is created on first balance read', async () => {
    const wallet = await readWalletSummaryAsync(app.locals.db, 'creem@example.com');
    assert.equal(wallet.enabled, true);
    assert.equal(wallet.balance, 0);
});

test('webhook signature verification uses HMAC-SHA256 hex', () => {
    const body = JSON.stringify({ id: 'evt_test', eventType: 'checkout.completed' });
    const secret = 'whsec_creem_test';
    const signature = signCreemBody(body, secret);
    assert.equal(verifyCreemWebhookSignature(body, signature, secret), true);
    assert.equal(verifyCreemWebhookSignature(body, 'deadbeef', secret), false);
    assert.equal(verifyCreemWebhookSignature({ forged: true }, signature, secret), false);
});

test('Creem webhook rejects missing or invalid signature with 401', async () => {
    const body = JSON.stringify({ id: 'evt_missing_sig', eventType: 'checkout.completed' });
    const missing = await request(app)
        .post('/api/payments/creem/webhook')
        .set('Content-Type', 'application/json')
        .send(body);
    assert.equal(missing.status, 401);

    const invalid = await request(app)
        .post('/api/payments/creem/webhook')
        .set('Content-Type', 'application/json')
        .set('creem-signature', '00'.repeat(32))
        .send(body);
    assert.equal(invalid.status, 401);
});

test('duplicate Creem webhook events are ignored at claim layer', async () => {
    const connection = app.locals.db;
    const eventId = `evt_creem_dup_${Date.now()}`;
    assert.equal(await wasCreemEventProcessed(connection, eventId), false);
    assert.equal(await claimCreemEvent(connection, eventId, 'checkout.completed'), true);
    assert.equal(await claimCreemEvent(connection, eventId, 'checkout.completed'), false);
    assert.equal(await wasCreemEventProcessed(connection, eventId), true);
    await markCreemEventProcessed(connection, eventId, 'checkout.completed');
});

test('Creem checkout.completed grants credits once with server-side price validation', async () => {
    const connection = app.locals.db;
    const email = 'creem@example.com';
    const starter = resolvePackConfig('starter');
    const checkout = {
        id: 'ch_test_starter',
        request_id: 'req_test_1',
        metadata: {
            purchaseType: 'ai_credit_pack',
            packageId: 'starter',
            email,
            credits: String(starter.credits),
            priceUsdCents: String(starter.priceUsdCents),
        },
        customer: { email },
        order: {
            id: 'ord_test_starter',
            amount: starter.priceUsdCents,
            currency: 'USD',
            status: 'paid',
        },
    };
    const grant = await handleCreemCheckoutCompleted(connection, checkout);
    assert.equal(grant.credits, starter.credits);
    assert.equal(await readBalanceAsync(connection, email), starter.credits);
    const again = await handleCreemCheckoutCompleted(connection, checkout);
    assert.equal(again.duplicate, true);
});

test('Creem checkout rejects missing or mismatched paid amount', async () => {
    const connection = app.locals.db;
    const email = 'creem-amount@example.com';
    const starter = resolvePackConfig('starter');
    await assert.rejects(
        () => handleCreemCheckoutCompleted(connection, {
            id: 'ch_missing_amount',
            metadata: { purchaseType: 'ai_credit_pack', packageId: 'starter', email },
            customer: { email },
            order: { id: 'ord_missing_amount', currency: 'USD', status: 'paid' },
        }),
        (error) => error.code === 'CREEM_AMOUNT_MISSING',
    );
    await assert.rejects(
        () => handleCreemCheckoutCompleted(connection, {
            id: 'ch_bad_amount',
            metadata: { purchaseType: 'ai_credit_pack', packageId: 'starter', email },
            customer: { email },
            order: {
                id: 'ord_bad_amount',
                amount: starter.priceUsdCents - 1,
                currency: 'USD',
                status: 'paid',
            },
        }),
        (error) => error.code === 'AI_CREDIT_PRICE_MISMATCH',
    );
    assert.equal(await readBalanceAsync(connection, email), 0);
});

test('signed Creem webhook grants credits and ignores duplicates', async () => {
    const connection = app.locals.db;
    const email = 'creem-webhook@example.com';
    const starter = resolvePackConfig('starter');
    const event = {
        id: `evt_signed_grant_${Date.now()}`,
        eventType: 'checkout.completed',
        object: {
            id: 'ch_signed_grant',
            request_id: 'req_signed_grant',
            metadata: {
                purchaseType: 'ai_credit_pack',
                packageId: 'starter',
                email,
                credits: String(starter.credits),
            },
            customer: { email },
            order: {
                id: `ord_signed_grant_${Date.now()}`,
                amount: starter.priceUsdCents,
                currency: 'USD',
                status: 'paid',
            },
        },
    };
    const body = JSON.stringify(event);
    const first = await request(app)
        .post('/api/payments/creem/webhook')
        .set('Content-Type', 'application/json')
        .set('creem-signature', signCreemBody(body))
        .send(body);
    assert.equal(first.status, 200);
    assert.equal(first.body.received, true);
    assert.equal(await readBalanceAsync(connection, email), starter.credits);

    const second = await request(app)
        .post('/api/payments/creem/webhook')
        .set('Content-Type', 'application/json')
        .set('creem-signature', signCreemBody(body))
        .send(body);
    assert.equal(second.status, 200);
    assert.equal(second.body.duplicate, true);
    assert.equal(await readBalanceAsync(connection, email), starter.credits);
});

test('Creem refund reverses granted credits idempotently', async () => {
    const connection = app.locals.db;
    const email = 'creem@example.com';
    const before = await readBalanceAsync(connection, email);
    const refund = await handleCreemRefundCreated(connection, {
        id: 'rf_test_1',
        order: { id: 'ord_test_starter', amount: resolvePackConfig('starter').priceUsdCents },
    });
    assert.ok(refund);
    const after = await readBalanceAsync(connection, email);
    assert.ok(after < before);
    const again = await handleCreemRefundCreated(connection, {
        id: 'rf_test_1',
        order: { id: 'ord_test_starter', amount: resolvePackConfig('starter').priceUsdCents },
    });
    assert.equal(again.duplicate, true);
    assert.equal(await readBalanceAsync(connection, email), after);
});

test('transient webhook failures release claim for retry', async () => {
    const connection = app.locals.db;
    const eventId = `evt_release_${Date.now()}`;
    assert.equal(await claimCreemEvent(connection, eventId, 'checkout.completed'), true);
    await releaseCreemEventClaim(connection, eventId);
    assert.equal(await wasCreemEventProcessed(connection, eventId), false);
    assert.equal(await claimCreemEvent(connection, eventId, 'checkout.completed'), true);
});

test('concurrent credit spending cannot drive balance negative', async () => {
    const connection = app.locals.db;
    const email = `concurrent-${Date.now()}@example.com`;
    await grantCreditsIdempotentAsync(connection, {
        email,
        amount: 10,
        referenceId: `seed_${Date.now()}`,
        entryType: 'purchase',
    });
    const results = await Promise.allSettled([
        deductCreditsAsync(connection, { email, amount: 8, referenceId: `spend_a_${Date.now()}` }),
        deductCreditsAsync(connection, { email, amount: 8, referenceId: `spend_b_${Date.now()}` }),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assert.equal(rejected[0].reason?.code, 'AI_CREDITS_EXHAUSTED');
    assert.equal(await readBalanceAsync(connection, email), 2);
});

test('public packages endpoint advertises checkout preview only', async () => {
    const response = await request(app).get('/api/credits/packages');
    assert.equal(response.status, 200);
    assert.equal(response.body.checkoutAvailable, false);
    assert.equal(response.body.creem.merchantApprovalPending, true);
    assert.ok(Array.isArray(response.body.packages));
    assert.equal(response.body.packages[0].priceDisplay, '$5.00');
});

test('Creem moderation stays off while checkout disabled', () => {
    assert.equal(isCreemModerationEnabled(), false);
});

test('Creem moderation blocks deny and flag decisions when enabled', async () => {
    const previous = process.env.CREEM_MODERATION_ENABLED;
    process.env.CREEM_MODERATION_ENABLED = 'true';
    try {
        await assert.rejects(
            () => screenPromptWithCreem({
                prompt: 'unsafe prompt',
                fetchImpl: async () => ({
                    ok: true,
                    json: async () => ({ id: 'mod_deny', decision: 'deny' }),
                }),
            }),
            (error) => error.code === 'CREEM_PROMPT_DENIED',
        );
        await assert.rejects(
            () => screenPromptWithCreem({
                prompt: 'borderline prompt',
                fetchImpl: async () => ({
                    ok: true,
                    json: async () => ({ id: 'mod_flag', decision: 'flag' }),
                }),
            }),
            (error) => error.code === 'CREEM_PROMPT_FLAGGED',
        );
        const allowed = await screenPromptWithCreem({
            prompt: 'a watercolor lighthouse',
            fetchImpl: async () => ({
                ok: true,
                json: async () => ({ id: 'mod_allow', decision: 'allow' }),
            }),
        });
        assert.equal(allowed.allowed, true);
    } finally {
        if (previous == null) delete process.env.CREEM_MODERATION_ENABLED;
        else process.env.CREEM_MODERATION_ENABLED = previous;
    }
});
