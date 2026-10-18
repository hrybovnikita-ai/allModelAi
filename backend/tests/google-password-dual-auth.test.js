const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.EXPOSE_ACCOUNT_TOKENS = 'true';
process.env.FRONTEND_ORIGIN = 'http://localhost:5173';
process.env.DB_FILE = path.join(os.tmpdir(), `allmodelai-dual-auth-${process.pid}-${Date.now()}.sqlite`);

const app = require('../app');
const admin = require('../src/firebaseAdmin');
const db = app.locals.db.database;

const verified = new Map();
const originalVerify = admin.verifySocialToken;
admin.verifySocialToken = async (token) => {
    if (!verified.has(token)) throw Object.assign(new Error('Rejected'), { code: 'auth/id-token-expired' });
    return verified.get(token);
};

function googleToken(key, email) {
    verified.set(key, {
        uid: `firebase-${key}`,
        auth_time: Math.floor(Date.now() / 1000),
        email,
        email_verified: true,
        name: 'Dual Auth User',
        firebase: { sign_in_provider: 'google.com', identities: { 'google.com': [key] } },
    });
    return key;
}

const postSocial = (agent, url, data) => agent
    .post(url)
    .set('Origin', 'http://localhost:5173')
    .set('X-AllModelAI-Auth', '1')
    .send(data);

async function googleLogin(agent, email) {
    const key = googleToken(`g-${email}`, email);
    const challenge = await postSocial(agent, '/api/auth/firebase/challenge', { intent: 'login' });
    assert.equal(challenge.status, 200);
    return postSocial(agent, '/api/auth/firebase', { idToken: key, state: challenge.body.state, intent: 'login' });
}

after(() => {
    admin.verifySocialToken = originalVerify;
    app.locals.db.close();
    fs.rmSync(process.env.DB_FILE, { force: true });
});

test('Google-only account login returns generic INVALID_CREDENTIALS', async () => {
    const email = 'google-only@example.com';
    const agent = request.agent(app);
    const google = await googleLogin(agent, email);
    assert.equal(google.status, 200);

    const blocked = await request(app).post('/api/auth/login').send({
        email,
        password: 'any-password-123',
    });
    assert.equal(blocked.status, 401);
    assert.equal(blocked.body.code, 'INVALID_CREDENTIALS');
    assert.match(blocked.body.message, /incorrect email or password/i);
    assert.equal(blocked.body.passwordEnabled, undefined);
    assert.equal(blocked.body.providers, undefined);
});

test('invalid password stays 401 without revealing account details', async () => {
    const email = 'dual-valid@example.com';
    await request(app).post('/api/auth/register').send({
        name: 'Valid User',
        email,
        password: 'correct-password',
    });
    const bad = await request(app).post('/api/auth/login').send({
        email,
        password: 'wrong-password-1',
    });
    assert.equal(bad.status, 401);
    assert.equal(bad.body.code, 'INVALID_CREDENTIALS');
    assert.match(bad.body.message, /incorrect email or password/i);

    const missing = await request(app).post('/api/auth/login').send({
        email: 'nobody-here@example.com',
        password: 'wrong-password-1',
    });
    assert.equal(missing.status, 401);
    assert.equal(missing.body.code, bad.body.code);
    assert.equal(missing.body.message, bad.body.message);
});

test('Google user can set password in Settings and sign in with email or Google', async () => {
    const email = 'settings-enroll@example.com';
    const agent = request.agent(app);
    const google = await googleLogin(agent, email);
    assert.equal(google.status, 200);
    const userId = google.body.user.id;

    const securityBefore = await agent.get('/api/auth/account/security');
    assert.equal(securityBefore.status, 200);
    assert.equal(securityBefore.body.passwordEnabled, false);

    const blocked = await request(app).post('/api/auth/login').send({
        email,
        password: 'settings-password-1',
    });
    assert.equal(blocked.status, 401);
    assert.equal(blocked.body.code, 'INVALID_CREDENTIALS');

    const enrolled = await agent.post('/api/auth/account/password').send({
        newPassword: 'settings-password-1',
        confirmPassword: 'settings-password-1',
    });
    assert.equal(enrolled.status, 200);
    assert.equal(enrolled.body.passwordEnabled, true);

    const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId);
    assert.ok(row?.password_hash, 'password hash must persist on the same user row');

    const securityAfter = await agent.get('/api/auth/account/security');
    assert.equal(securityAfter.body.passwordEnabled, true);

    await agent.post('/api/auth/logout');

    const passwordLogin = await request.agent(app).post('/api/auth/login').send({
        email,
        password: 'settings-password-1',
    });
    assert.equal(passwordLogin.status, 200);
    assert.equal(passwordLogin.body.user.id, userId);

    const loginAgent = request.agent(app);
    const sessionLogin = await loginAgent.post('/api/auth/login').send({
        email,
        password: 'settings-password-1',
    });
    assert.equal(sessionLogin.status, 200);
    const session = await loginAgent.get('/api/auth/session');
    assert.equal(session.status, 200);
    assert.equal(session.body.user.id, userId);

    const analytics = await loginAgent.get('/api/analytics');
    assert.equal(analytics.status, 200);
    assert.equal(typeof analytics.body.conversations, 'number');
    assert.equal(typeof analytics.body.messages, 'number');
    assert.ok(analytics.body.byModel && typeof analytics.body.byModel === 'object');

    const otherAgent = request.agent(app);
    await otherAgent.post('/api/auth/register').send({
        name: 'Other User',
        email: 'other-analytics@example.com',
        password: 'other-password-1',
    });
    const otherAnalytics = await otherAgent.get('/api/analytics');
    assert.equal(otherAnalytics.status, 200);
    // New account has no chats — must not inherit the enrolled user's aggregates by accident.
    assert.equal(otherAnalytics.body.conversations, 0);

    const googleAgain = await googleLogin(request.agent(app), email);
    assert.equal(googleAgain.status, 200);
    assert.equal(googleAgain.body.user.id, userId);
});

test('Google-only user can create password through email reset token without Google session', async () => {
    const email = 'reset-enroll@example.com';
    const agent = request.agent(app);
    assert.equal((await googleLogin(agent, email)).status, 200);
    await agent.post('/api/auth/logout');

    const requested = await request(app).post('/api/auth/password-reset/request').send({ email });
    assert.equal(requested.status, 200);
    assert.ok(requested.body.token);

    const confirmed = await request(app).post('/api/auth/password-reset/confirm').send({
        token: requested.body.token,
        password: 'reset-password-1',
    });
    assert.equal(confirmed.status, 200);

    const login = await request(app).post('/api/auth/login').send({
        email,
        password: 'reset-password-1',
    });
    assert.equal(login.status, 200);
    assert.ok(db.prepare('SELECT password_hash FROM users WHERE lower(email)=lower(?)').get(email).password_hash);
});
