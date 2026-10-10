require('./test-preload');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { hashPassword } = require('../src/password');
const {
    createPostgresHttpMockPool,
    attachPostgresAppDb,
} = require('./pgMockPool');

process.env.NODE_ENV = 'test';
process.env.ENABLE_PLUS_TEST_MODE = 'true';
process.env.DEVELOPER_EMAILS = 'claude-pg-knowledge@example.com';
process.env.OPENROUTER_API_KEY = 'or-claude-pg-test-key';

const CHAT_ANSWER = 'Claude haiku postgres knowledge path ok';
const deadline = { deadline: 12000 };
let originalFetch;

function mockOpenRouterClaudeStream(answerText = CHAT_ANSWER) {
    const encoder = new TextEncoder();
    return async (url) => {
        assert.match(String(url), /openrouter\.ai/);
        return new Response(new ReadableStream({
            start(controller) {
                controller.enqueue(encoder.encode(
                    `data: ${JSON.stringify({ choices: [{ delta: { content: answerText } }] })}\n\n`,
                ));
                controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                controller.close();
            },
        }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    };
}

before(() => {
    originalFetch = global.fetch;
    global.fetch = mockOpenRouterClaudeStream();
});

after(() => {
    global.fetch = originalFetch;
});

async function loginAndGetCookie(app, email, password) {
    const login = await request(app).post('/api/auth/login').send({ email, password }).timeout(deadline);
    assert.equal(login.status, 200, login.body?.message);
    const cookie = login.headers['set-cookie']?.[0]?.split(';')[0];
    assert.ok(cookie);
    return cookie;
}

test('POST /api/chat claude haiku on postgres does not 500 when knowledge retrieval runs', async () => {
    const password = 'ClaudePgKnowledge123!';
    const passwordHash = await hashPassword(password);
    const email = 'claude-pg-knowledge@example.com';
    const mockPool = createPostgresHttpMockPool({
        id: 882,
        name: 'Claude PG Knowledge',
        email,
        password_hash: passwordHash,
        avatar_url: null,
    }, { trackChat: true });

    const app = require('../app');
    const db = attachPostgresAppDb(app, mockPool, { trapSyncPrepare: true });

    try {
        const cookie = await loginAndGetCookie(app, email, password);

        const access = await request(app)
            .patch('/api/access-mode')
            .set('Cookie', cookie)
            .send({ mode: 'developer' })
            .timeout(deadline);
        assert.equal(access.status, 200, access.body?.message);
        assert.equal(access.body.plusTestMode, true);

        const chat = await request(app)
            .post('/api/chat')
            .set('Cookie', cookie)
            .send({
                model: 'claude',
                variant: 'haiku',
                temporary: true,
                messages: [{ role: 'user', text: 'Make me a Python snake game.' }],
            })
            .timeout(deadline);

        assert.notEqual(chat.status, 500, chat.body?.message || chat.text?.slice(0, 300));
        assert.equal(chat.status, 200, chat.body?.message || chat.text?.slice(0, 300));
        assert.match(chat.text, new RegExp(CHAT_ANSWER));
        assert.equal(db.getSyncViolationCount(), 0);
    } finally {
        db.restore();
    }
});
