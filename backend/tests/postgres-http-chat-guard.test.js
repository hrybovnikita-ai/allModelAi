const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { hashPassword } = require('../src/password');
const {
    createPostgresHttpMockPool,
    attachPostgresAppDb,
    mockGeminiChatFetch,
    waitForChatPersistence,
} = require('./pgMockPool');

process.env.NODE_ENV = 'test';

const CHAT_ANSWER = 'Mock PG chat answer';
const deadline = { deadline: 12000 };
let originalFetch;
let originalGeminiKey;

before(() => {
    originalFetch = global.fetch;
    originalGeminiKey = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = 'pg-chat-guard-test-key';
    global.fetch = mockGeminiChatFetch(CHAT_ANSWER);
});

after(() => {
    global.fetch = originalFetch;
    if (originalGeminiKey === undefined) {
        delete process.env.GEMINI_API_KEY;
    } else {
        process.env.GEMINI_API_KEY = originalGeminiKey;
    }
});

async function loginAndGetCookie(app, email, password) {
    const login = await request(app).post('/api/auth/login').send({ email, password }).timeout(deadline);
    assert.equal(login.status, 200, login.body?.message);
    const cookie = login.headers['set-cookie']?.[0]?.split(';')[0];
    assert.ok(cookie);
    return cookie;
}

test('POST /api/chat on postgres uses async path and completes persistence after stream', async () => {
    const password = 'PgChatGuard123!';
    const passwordHash = await hashPassword(password);
    const email = 'pg-chat-guard@example.com';
    const mockPool = createPostgresHttpMockPool({
        id: 880,
        name: 'Chat Guard',
        email,
        password_hash: passwordHash,
        avatar_url: null,
    }, { trackChat: true });

    const app = require('../app');
    const db = attachPostgresAppDb(app, mockPool, { trapSyncPrepare: true });

    try {
        const cookie = await loginAndGetCookie(app, email, password);

        const subscription = await request(app).get('/api/subscription').set('Cookie', cookie).timeout(deadline);
        assert.equal(subscription.status, 200);

        const creditsBefore = await request(app).get('/api/credits').set('Cookie', cookie).timeout(deadline);
        assert.equal(creditsBefore.status, 200);

        const chat = await request(app)
            .post('/api/chat')
            .set('Cookie', cookie)
            .send({
                model: 'gemini',
                temporary: false,
                messages: [{ role: 'user', content: 'Hello postgres guard' }],
            })
            .timeout(deadline);

        assert.equal(chat.status, 200, chat.body?.message || chat.text?.slice(0, 200));
        assert.match(chat.text, new RegExp(CHAT_ANSWER));

        await waitForChatPersistence(mockPool);

        assert.equal(mockPool.usageEvents.length, 1);
        assert.equal(mockPool.usageEvents[0].model, 'gemini');
        assert.equal(mockPool.conversations.length, 1);
        const storedMessages = JSON.parse(mockPool.conversations[0].messages);
        assert.ok(storedMessages.some((item) => String(item.content || item.text || '').includes(CHAT_ANSWER)));

        assert.ok(mockPool.usageCounts.get(email) >= 1, 'usage counter should increment');

        const history = await request(app).get('/api/chat/history').set('Cookie', cookie).timeout(deadline);
        assert.equal(history.status, 200);
        assert.equal(history.body.length, 1);
        assert.ok(history.body[0].messages.some((item) => String(item.content || item.text || '').includes(CHAT_ANSWER)));

        assert.equal(db.getSyncViolationCount(), 0);
    } finally {
        db.restore();
    }
});

test('concurrent POST /api/chat and dashboard reads terminate without sync postgres', async () => {
    const password = 'PgChatConcurrent123!';
    const passwordHash = await hashPassword(password);
    const email = 'pg-chat-concurrent@example.com';
    const mockPool = createPostgresHttpMockPool({
        id: 881,
        name: 'Chat Concurrent',
        email,
        password_hash: passwordHash,
        avatar_url: null,
    }, { trackChat: true });

    const app = require('../app');
    const db = attachPostgresAppDb(app, mockPool, { trapSyncPrepare: true });

    try {
        const cookie = await loginAndGetCookie(app, email, password);

        const tasks = [
            request(app)
                .post('/api/chat')
                .set('Cookie', cookie)
                .send({ model: 'gemini', temporary: true, messages: [{ role: 'user', content: 'concurrent hello' }] })
                .timeout(deadline),
            request(app).get('/api/auth/session').set('Cookie', cookie).timeout(deadline),
            request(app).get('/api/subscription').set('Cookie', cookie).timeout(deadline),
            request(app).get('/api/credits').set('Cookie', cookie).timeout(deadline),
            request(app).get('/api/status/models').timeout(deadline),
        ];

        const results = await Promise.all(tasks);
        for (const result of results) {
            assert.ok(result.status >= 200 && result.status < 500, `unexpected status ${result.status}`);
        }
        assert.match(results[0].text, new RegExp(CHAT_ANSWER));
        assert.equal(db.getSyncViolationCount(), 0);
    } finally {
        db.restore();
    }
});
