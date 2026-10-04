const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');
const { createPostgresHttpMockPool, attachPostgresAppDb } = require('./pgMockPool');

process.env.NODE_ENV = 'test';
process.env.FRONTEND_ORIGIN = 'https://all-model-ai.vercel.app';
process.env.DB_FILE = path.join(os.tmpdir(), `allmodelai-pg-social-${process.pid}-${Date.now()}.sqlite`);

const admin = require('../src/firebaseAdmin');
const originalVerify = admin.verifySocialToken;

function googleToken(key, overrides = {}) {
    return {
        uid: `firebase-${key}`,
        auth_time: Math.floor(Date.now() / 1000),
        email: `${key}@example.com`,
        email_verified: true,
        name: 'Google User',
        picture: 'https://example.com/avatar.png',
        firebase: {
            sign_in_provider: 'google.com',
            identities: { 'google.com': [key] },
        },
        ...overrides,
    };
}

const post = (agent, url, data) => agent
    .post(url)
    .set('Origin', 'https://all-model-ai.vercel.app')
    .set('X-AllModelAI-Auth', '1')
    .send(data);

async function loginGoogle(agent, subjectKey) {
    const idToken = `mock-token-${subjectKey}`;
    admin.verifySocialToken = async (token) => {
        if (token !== idToken) throw Object.assign(new Error('Rejected'), { code: 'auth/id-token-expired' });
        return googleToken(subjectKey);
    };
    const challenge = await post(agent, '/api/auth/firebase/challenge', { intent: 'login' });
    assert.equal(challenge.status, 200, challenge.body?.message);
    return post(agent, '/api/auth/firebase', {
        idToken,
        state: challenge.body.state,
        intent: 'login',
        rememberMe: true,
    });
}

test('postgres firebase exchange uses valid email_verified SQL and creates session', async () => {
    const mockPool = createPostgresHttpMockPool({
        id: 1,
        name: 'Seed',
        email: 'seed@internal.local',
        password_hash: 'seed:00',
        avatar_url: null,
        email_verified: 0,
    }, { trackSocial: true });
    const app = require('../app');
    const db = attachPostgresAppDb(app, mockPool);

    try {
        const agent = request.agent(app);
        const first = await loginGoogle(agent, 'google-pg-new');
        assert.equal(first.status, 200, JSON.stringify(first.body));
        assert.equal(first.body.user.email, 'google-pg-new@example.com');
        assert.ok(first.headers['set-cookie']?.some((c) => c.startsWith('allmodelai_session=')));

        const session = await agent.get('/api/auth/me');
        assert.equal(session.status, 200);
        assert.equal(session.body.user.email, 'google-pg-new@example.com');

        const created = [...mockPool.extraUsers.values()].find(
            (row) => row.email === 'google-pg-new@example.com',
        );
        assert.ok(created, 'expected new postgres user row');
        assert.equal(created.email_verified, 1);

        const returning = await loginGoogle(request.agent(app), 'google-pg-new');
        assert.equal(returning.status, 200);
        assert.equal(returning.body.user.email, 'google-pg-new@example.com');
    } finally {
        admin.verifySocialToken = originalVerify;
        db.restore();
    }
});

test('postgres firebase links verified email to an existing password account', async () => {
    const email = 'existing-google@example.com';
    const mockPool = createPostgresHttpMockPool({
        id: 50,
        name: 'Password Owner',
        email,
        password_hash: 'hash:abc',
        avatar_url: null,
        email_verified: 1,
    }, { trackSocial: true });

    const app = require('../app');
    const db = attachPostgresAppDb(app, mockPool);

    try {
        admin.verifySocialToken = async () => googleToken('google-existing-subject', { email });
        const agent = request.agent(app);
        const challenge = await post(agent, '/api/auth/firebase/challenge', { intent: 'login' });
        assert.equal(challenge.status, 200);
        const exchange = await post(agent, '/api/auth/firebase', {
            idToken: 'mock-token-google-existing-subject',
            state: challenge.body.state,
            intent: 'login',
        });
        assert.equal(exchange.status, 200, JSON.stringify(exchange.body));
        assert.equal(exchange.body.user.id, 50);
        assert.equal(exchange.body.user.email, email);
    } finally {
        admin.verifySocialToken = originalVerify;
        db.restore();
    }
});
