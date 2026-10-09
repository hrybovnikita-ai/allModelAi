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

const CHAT_ANSWER = 'Mock stress chat answer';
let originalFetch;
let originalGeminiKey;

before(() => {
    originalFetch = global.fetch;
    originalGeminiKey = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = 'pg-stress-chat-key';
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

test('ten dashboard browser flows complete on postgres async paths', async () => {
    const password = 'DashFlow123!';
    const passwordHash = await hashPassword(password);
    const email = 'dash-flow@example.com';
    const mockPool = createPostgresHttpMockPool({
        id: 901,
        name: 'Dash Flow',
        email,
        password_hash: passwordHash,
        avatar_url: null,
    });

    const app = require('../app');
    const db = attachPostgresAppDb(app, mockPool);
    const deadline = { deadline: 8000 };

    try {
        for (let cycle = 1; cycle <= 10; cycle += 1) {
            const login = await request(app)
                .post('/api/auth/login')
                .send({ email, password, rememberMe: true })
                .timeout(deadline);
            assert.equal(login.status, 200, `login cycle ${cycle}`);

            const cookie = login.headers['set-cookie']?.[0]?.split(';')[0];
            assert.ok(cookie, `cookie cycle ${cycle}`);

            const session1 = await request(app)
                .get('/api/auth/session')
                .set('Cookie', cookie)
                .timeout(deadline);
            assert.equal(session1.status, 200, `session1 cycle ${cycle}`);

            const subscription = await request(app)
                .get('/api/subscription')
                .set('Cookie', cookie)
                .timeout(deadline);
            assert.equal(subscription.status, 200, `subscription cycle ${cycle}`);
            assert.equal(typeof subscription.body.remaining, 'number');

            const credits = await request(app)
                .get('/api/credits')
                .set('Cookie', cookie)
                .timeout(deadline);
            assert.equal(credits.status, 200, `credits cycle ${cycle}`);

            const models = await request(app).get('/api/status/models').timeout(deadline);
            assert.equal(models.status, 200, `models cycle ${cycle}`);

            const history = await request(app)
                .get('/api/chat/history')
                .set('Cookie', cookie)
                .timeout(deadline);
            assert.equal(history.status, 200, `history cycle ${cycle}`);

            const session2 = await request(app)
                .get('/api/auth/session')
                .set('Cookie', cookie)
                .timeout(deadline);
            assert.equal(session2.status, 200, `session2 cycle ${cycle}`);

            const logout = await request(app)
                .post('/api/auth/logout')
                .set('Cookie', cookie)
                .timeout(deadline);
            assert.equal(logout.status, 204, `logout cycle ${cycle}`);

            const sessionAfterLogout = await request(app)
                .get('/api/auth/session')
                .set('Cookie', cookie)
                .timeout(deadline);
            assert.equal(sessionAfterLogout.status, 200, `session after logout cycle ${cycle}`);
            assert.equal(sessionAfterLogout.body.user, null, `session after logout cycle ${cycle}`);
        }
    } finally {
        db.restore();
    }
});

test('concurrent dashboard init and session requests all terminate on postgres', async () => {
    const password = 'DashConcurrent123!';
    const passwordHash = await hashPassword(password);
    const email = 'dash-concurrent@example.com';
    const mockPool = createPostgresHttpMockPool({
        id: 902,
        name: 'Concurrent',
        email,
        password_hash: passwordHash,
        avatar_url: null,
    });

    const app = require('../app');
    const db = attachPostgresAppDb(app, mockPool);
    const deadline = { deadline: 8000 };

    try {
        const login = await request(app)
            .post('/api/auth/login')
            .send({ email, password })
            .timeout(deadline);
        assert.equal(login.status, 200);
        const cookie = login.headers['set-cookie']?.[0]?.split(';')[0];

        const tasks = [
            request(app).get('/api/auth/session').set('Cookie', cookie).timeout(deadline),
            request(app).get('/api/subscription').set('Cookie', cookie).timeout(deadline),
            request(app).get('/api/credits').set('Cookie', cookie).timeout(deadline),
            request(app).get('/api/chat/history').set('Cookie', cookie).timeout(deadline),
            request(app).get(`/api/analytics?email=${encodeURIComponent(email)}`).set('Cookie', cookie).timeout(deadline),
            request(app).get('/api/workspace?type=project').set('Cookie', cookie).timeout(deadline),
            request(app).get('/api/status/models').timeout(deadline),
        ];
        const results = await Promise.all(tasks);
        for (const result of results) {
            assert.ok(result.status >= 200 && result.status < 500, `unexpected status ${result.status}`);
        }
    } finally {
        db.restore();
    }
});

test('realistic traffic: login through chat, history, analytics, workspace, logout (10x)', async () => {
    const password = 'StressFlow123!';
    const passwordHash = await hashPassword(password);
    const email = 'stress-flow@example.com';
    const mockPool = createPostgresHttpMockPool({
        id: 904,
        name: 'Stress',
        email,
        password_hash: passwordHash,
        avatar_url: null,
    }, { trackChat: true });

    const app = require('../app');
    const db = attachPostgresAppDb(app, mockPool, { trapSyncPrepare: true });
    const deadline = { deadline: 12000 };

    try {
        for (let cycle = 1; cycle <= 10; cycle += 1) {
            const login = await request(app).post('/api/auth/login').send({ email, password }).timeout(deadline);
            assert.equal(login.status, 200, `login ${cycle}`);
            const cookie = login.headers['set-cookie']?.[0]?.split(';')[0];

            const session = await request(app).get('/api/auth/session').set('Cookie', cookie).timeout(deadline);
            assert.equal(session.status, 200, `session ${cycle}`);

            const subscription = await request(app).get('/api/subscription').set('Cookie', cookie).timeout(deadline);
            assert.equal(subscription.status, 200, `subscription ${cycle}`);

            const credits = await request(app).get('/api/credits').set('Cookie', cookie).timeout(deadline);
            assert.equal(credits.status, 200, `credits ${cycle}`);

            const chat = await request(app)
                .post('/api/chat')
                .set('Cookie', cookie)
                .send({
                    model: 'gemini',
                    temporary: false,
                    messages: [{ role: 'user', content: `Cycle ${cycle} hello` }],
                })
                .timeout(deadline);
            assert.equal(chat.status, 200, `chat ${cycle}`);
            assert.match(chat.text, new RegExp(CHAT_ANSWER));
            await waitForChatPersistence(mockPool);

            const history = await request(app).get('/api/chat/history').set('Cookie', cookie).timeout(deadline);
            assert.equal(history.status, 200, `history ${cycle}`);
            assert.ok(history.body.length >= cycle, `history length cycle ${cycle}`);

            const analytics = await request(app).get('/api/analytics').set('Cookie', cookie).timeout(deadline);
            assert.equal(analytics.status, 200, `analytics ${cycle}`);

            const workspace = await request(app).get('/api/workspace?type=project').set('Cookie', cookie).timeout(deadline);
            assert.equal(workspace.status, 200, `workspace list ${cycle}`);

            const workspaceCreate = await request(app)
                .post('/api/workspace')
                .set('Cookie', cookie)
                .send({ type: 'project', name: `Cycle ${cycle}` })
                .timeout(deadline);
            assert.equal(workspaceCreate.status, 201, `workspace create ${cycle}`);

            const sessionAgain = await request(app).get('/api/auth/session').set('Cookie', cookie).timeout(deadline);
            assert.equal(sessionAgain.status, 200, `session again ${cycle}`);

            const logout = await request(app).post('/api/auth/logout').set('Cookie', cookie).timeout(deadline);
            assert.equal(logout.status, 204, `logout ${cycle}`);

            const sessionAfterLogout = await request(app).get('/api/auth/session').set('Cookie', cookie).timeout(deadline);
            assert.equal(sessionAfterLogout.status, 200, `session after logout ${cycle}`);
            assert.equal(sessionAfterLogout.body.user, null, `session after logout ${cycle}`);

            assert.equal(db.getSyncViolationCount(), 0, `sync violations cycle ${cycle}`);
        }
    } finally {
        db.restore();
    }
});

test('concurrent POST /api/chat with session, subscription, credits, models on postgres', async () => {
    const password = 'StressConcurrent123!';
    const passwordHash = await hashPassword(password);
    const email = 'stress-concurrent-chat@example.com';
    const mockPool = createPostgresHttpMockPool({
        id: 905,
        name: 'Stress Concurrent Chat',
        email,
        password_hash: passwordHash,
        avatar_url: null,
    }, { trackChat: true });

    const app = require('../app');
    const db = attachPostgresAppDb(app, mockPool, { trapSyncPrepare: true });
    const deadline = { deadline: 12000 };

    try {
        const login = await request(app).post('/api/auth/login').send({ email, password }).timeout(deadline);
        assert.equal(login.status, 200);
        const cookie = login.headers['set-cookie']?.[0]?.split(';')[0];

        const results = await Promise.all([
            request(app)
                .post('/api/chat')
                .set('Cookie', cookie)
                .send({ model: 'gemini', temporary: true, messages: [{ role: 'user', content: 'stress concurrent' }] })
                .timeout(deadline),
            request(app).get('/api/auth/session').set('Cookie', cookie).timeout(deadline),
            request(app).get('/api/subscription').set('Cookie', cookie).timeout(deadline),
            request(app).get('/api/credits').set('Cookie', cookie).timeout(deadline),
            request(app).get('/api/status/models').timeout(deadline),
        ]);

        for (const result of results) {
            assert.ok(result.status >= 200 && result.status < 500, `status ${result.status}`);
        }
        assert.match(results[0].text, new RegExp(CHAT_ANSWER));
        assert.equal(db.getSyncViolationCount(), 0);
    } finally {
        db.restore();
    }
});

test('dashboard subscription and credits fail if sync prepare is invoked on postgres', async () => {
    const password = 'NoSync123!';
    const passwordHash = await hashPassword(password);
    const email = 'no-sync@example.com';
    const mockPool = createPostgresHttpMockPool({
        id: 903,
        name: 'No Sync',
        email,
        password_hash: passwordHash,
        avatar_url: null,
    });

    const app = require('../app');
    const db = attachPostgresAppDb(app, mockPool, { trapSyncPrepare: true });
    const deadline = { deadline: 8000 };

    try {
        const login = await request(app)
            .post('/api/auth/login')
            .send({ email, password })
            .timeout(deadline);
        assert.equal(login.status, 200);
        const cookie = login.headers['set-cookie']?.[0]?.split(';')[0];

        const subscription = await request(app)
            .get('/api/subscription')
            .set('Cookie', cookie)
            .timeout(deadline);
        assert.equal(subscription.status, 200);
        assert.equal(db.getPrepareCalls(), 0);

        const credits = await request(app)
            .get('/api/credits')
            .set('Cookie', cookie)
            .timeout(deadline);
        assert.equal(credits.status, 200);
        assert.equal(db.getPrepareCalls(), 0);

        const history = await request(app)
            .get('/api/chat/history')
            .set('Cookie', cookie)
            .timeout(deadline);
        assert.equal(history.status, 200);
        assert.equal(db.getPrepareCalls(), 0);
    } finally {
        db.restore();
    }
});
