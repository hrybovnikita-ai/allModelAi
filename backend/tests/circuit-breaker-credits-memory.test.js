const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');

process.env.NODE_ENV = 'test';
process.env.AI_CREDITS_ENABLED = 'true';
process.env.PROVIDER_CB_FAILURE_THRESHOLD = '3';
process.env.PROVIDER_CB_SUCCESS_THRESHOLD = '1';
process.env.PROVIDER_CB_OPEN_MS = '10';
process.env.DB_FILE = path.join(os.tmpdir(), `allmodelai-cb-mem-${process.pid}-${Date.now()}.sqlite`);
process.env.API_KEY = 'test-gateway';
process.env.USER_MEMORY_SECRET = 'test-memory-secret-key-32bytes!!';

const {
    canAttempt,
    recordFailure,
    recordSuccess,
    snapshot,
    resetCircuitBreakersForTests,
} = require('../src/services/providerCircuitBreaker');
const {
    recordProviderRequest,
    resetForTests: resetTelemetry,
    passiveStatusForProvider,
} = require('../src/services/providerRequestTelemetry');
const {
    reserveCreditsAsync,
    settleReservationAsync,
    releaseReservationAsync,
    grantCreditsIdempotentAsync,
    readBalanceAsync,
} = require('../src/billing/aiCreditLedger');
const { creditsForUsage, estimateMaxCreditHold, checkAiCreditsBeforeChat } = require('../src/billing/aiCreditUsage');
const {
    containsSensitiveContent,
    rankAndSelectMemories,
} = require('../src/services/memoryRetrieval');
const {
    updateSettings,
    createMemory,
    getDecryptedMemoriesForChat,
    clearAllMemories,
    listMemories,
} = require('../src/services/userMemoryService');

let app;
let connection;

before(async () => {
    app = require('../app');
    connection = app.locals.db;
});

after(() => {
    try {
        app.locals.db.close();
    } catch {
        /* ignore */
    }
});

test('circuit breaker opens after threshold and blocks attempts', () => {
    resetCircuitBreakersForTests();
    assert.equal(canAttempt('openai'), true);
    recordFailure('openai', { errorClass: 'server_error' });
    recordFailure('openai', { errorClass: 'timeout' });
    assert.equal(canAttempt('openai'), true);
    recordFailure('openai', { errorClass: 'server_error' });
    const snap = snapshot('openai');
    assert.equal(snap.state, 'open');
    assert.equal(canAttempt('openai'), false);
});

test('auth failures do not trip circuit breaker', () => {
    resetCircuitBreakersForTests();
    for (let i = 0; i < 10; i += 1) {
        recordFailure('claude', { errorClass: 'authentication_failed' });
    }
    assert.equal(snapshot('claude').state, 'closed');
    assert.equal(canAttempt('claude'), true);
});

test('telemetry updates circuit breaker and single failure is not permanent', () => {
    resetTelemetry();
    recordProviderRequest({
        provider: 'gemini',
        success: false,
        httpStatus: 500,
        message: 'boom',
    });
    assert.equal(canAttempt('gemini'), true);
    const passive = passiveStatusForProvider('gemini', true);
    assert.notEqual(passive.operationalStatus, 'not_configured');
});

test('credit reserve settle refunds unused hold; release restores on failure', async () => {
    const email = 'reserve-user@example.com';
    await grantCreditsIdempotentAsync(connection, {
        email,
        amount: 100,
        referenceId: `grant_reserve_${Date.now()}`,
    });
    const reserveRef = `chat_reserve_test_${Date.now()}`;
    const reserved = await reserveCreditsAsync(connection, {
        email,
        amount: 40,
        referenceId: reserveRef,
        metadata: { model: 'gemini' },
    });
    assert.equal(reserved.reserved, 40);
    assert.equal(await readBalanceAsync(connection, email), 60);

    const settled = await settleReservationAsync(connection, {
        email,
        referenceId: reserveRef,
        actualAmount: 12,
    });
    assert.equal(settled.settled, 12);
    assert.equal(settled.refunded, 28);
    assert.equal(await readBalanceAsync(connection, email), 88);

    const again = await settleReservationAsync(connection, {
        email,
        referenceId: reserveRef,
        actualAmount: 12,
    });
    assert.equal(again.duplicate, true);
    assert.equal(await readBalanceAsync(connection, email), 88);

    const failRef = `chat_reserve_fail_${Date.now()}`;
    await reserveCreditsAsync(connection, { email, amount: 20, referenceId: failRef });
    assert.equal(await readBalanceAsync(connection, email), 68);
    const released = await releaseReservationAsync(connection, { email, referenceId: failRef });
    assert.equal(released.refunded, 20);
    assert.equal(await readBalanceAsync(connection, email), 88);
    const releasedAgain = await releaseReservationAsync(connection, { email, referenceId: failRef });
    assert.equal(releasedAgain.duplicate, true);
    assert.equal(await readBalanceAsync(connection, email), 88);
});

test('concurrent reservations cannot overspend balance', async () => {
    const email = 'concurrent-credits@example.com';
    await grantCreditsIdempotentAsync(connection, {
        email,
        amount: 50,
        referenceId: `grant_conc_${Date.now()}`,
    });
    const results = await Promise.allSettled([
        reserveCreditsAsync(connection, { email, amount: 40, referenceId: `conc_a_${Date.now()}` }),
        reserveCreditsAsync(connection, { email, amount: 40, referenceId: `conc_b_${Date.now()}` }),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assert.equal(rejected[0].reason.code, 'AI_CREDITS_EXHAUSTED');
    assert.equal(await readBalanceAsync(connection, email), 10);
});

test('credit weights and hold estimate are configurable', () => {
    const cheap = creditsForUsage({ inputTokens: 1000, outputTokens: 0, model: 'llama' });
    const premium = creditsForUsage({ inputTokens: 1000, outputTokens: 0, model: 'claude' });
    assert.ok(premium >= cheap);
    const hold = estimateMaxCreditHold({ model: 'gpt', inputTokens: 500, maxOutputTokens: 1024 });
    assert.ok(hold >= 5);
    const gate = checkAiCreditsBeforeChat({ plan: 'free' }, 0);
    assert.equal(gate.allowed, false);
    assert.equal(gate.code, 'AI_CREDITS_EXHAUSTED');
});

test('memory opt-in isolation ranking and sensitive filter', async () => {
    const emailA = 'memory-a@example.com';
    const emailB = 'memory-b@example.com';
    await updateSettings(connection, emailA, { memoryEnabled: false });
    await assert.rejects(
        () => createMemory(connection, emailA, { content: 'I prefer short answers' }),
        (err) => err.code === 'MEMORY_DISABLED',
    );
    assert.deepEqual(await getDecryptedMemoriesForChat(connection, emailA, { query: 'answers' }), []);

    await updateSettings(connection, emailA, { memoryEnabled: true });
    await updateSettings(connection, emailB, { memoryEnabled: true });
    await createMemory(connection, emailA, { content: 'I work as a frontend engineer in Kyiv' });
    await createMemory(connection, emailA, { content: 'I enjoy hiking on weekends' });
    await createMemory(connection, emailB, { content: 'Secret other-user memory about baking' });

    const { syntheticOpenAiSk } = require('./syntheticSecrets');
    await assert.rejects(
        () => createMemory(connection, emailA, {
            content: `My API key is ${syntheticOpenAiSk('abcdefghijklmnopqrstuvwxyz123456')}`,
        }),
        (err) => err.code === 'MEMORY_SENSITIVE_CONTENT',
    );
    assert.equal(containsSensitiveContent('password: hunter2'), true);

    const ranked = await getDecryptedMemoriesForChat(connection, emailA, {
        query: 'frontend engineer Kyiv',
        ranked: true,
    });
    assert.ok(ranked.length >= 1);
    assert.match(ranked[0], /frontend|Kyiv/i);
    assert.ok(!ranked.some((m) => /baking/i.test(m)));

    const listA = await listMemories(connection, emailA);
    const listB = await listMemories(connection, emailB);
    assert.ok(listA.every((item) => !/baking/i.test(item.contentPreview || '')));
    assert.ok(listB.every((item) => !/frontend/i.test(item.contentPreview || '')));

    await clearAllMemories(connection, emailA);
    assert.deepEqual(await getDecryptedMemoriesForChat(connection, emailA, { query: 'frontend' }), []);
});

test('rankAndSelectMemories respects budget and dedupes', () => {
    const result = rankAndSelectMemories(
        ['Prefer Ukrainian', 'Prefer Ukrainian', 'Likes TypeScript', 'Card 4111111111111111'],
        'TypeScript help',
        { maxChars: 80, maxItems: 3 },
    );
    assert.ok(result.texts.length <= 3);
    assert.equal(result.texts.filter((t) => /Prefer Ukrainian/.test(t)).length, 1);
    assert.ok(!result.texts.some((t) => /4111/.test(t)));
});

test('success closes half-open circuit after enough probes', async () => {
    resetCircuitBreakersForTests();
    recordFailure('mistral', { errorClass: 'timeout' });
    recordFailure('mistral', { errorClass: 'timeout' });
    recordFailure('mistral', { errorClass: 'timeout' });
    assert.equal(snapshot('mistral').state, 'open');
    await new Promise((resolve) => setTimeout(resolve, 25));
    assert.equal(canAttempt('mistral'), true);
    assert.equal(snapshot('mistral').state, 'half_open');
    recordSuccess('mistral');
    assert.equal(snapshot('mistral').state, 'closed');
});
