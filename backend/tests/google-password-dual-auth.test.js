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

test('Google-only account returns PASSWORD_SETUP_REQUIRED with provider hints', async () => {
    const email = 'google-only@example.com';
    const agent = request.agent(app);
    const google = await googleLogin(agent, email);
    assert.equal(google.status, 200);

    const blocked = await request(app).post('/api/auth/login').send({
        email,
        password: 'any-password-123',
    });
    assert.equal(blocked.status, 401);
    assert.equal(blocked.body.code, 'PASSWORD_SETUP_REQUIRED');
    assert.equal(blocked.body.passwordEnabled, false);
    assert.ok(Array.isArray(blocked.body.providers));
    assert.ok(blocked.body.providers.includes('google.com'));
    assert.equal(blocked.body.enrollmentPath, '/settings#settings-security');
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
    assert.notEqual(bad.body.code, 'PASSWORD_SETUP_REQUIRED');
    assert.match(bad.body.message, /incorrect email or password/i);
});

test('Google user can set password in Settings and sign in with email or Google', async () => {
    const email = 'settings-enroll@example.com';
    const agent = request.agent(app);
    const google = await googleLogin(agent, email);
    assert.equal(google.status, 200);
    const userId = google.body.user.id;

    const enrolled = await agent.post('/api/auth/account/password').send({
        newPassword: 'settings-password-1',
        confirmPassword: 'settings-password-1',
    });
    assert.equal(enrolled.status, 200);
    assert.equal(enrolled.body.passwordEnabled, true);

    await agent.post('/api/auth/logout');

    const passwordLogin = await request.agent(app).post('/api/auth/login').send({
        email,
        password: 'settings-password-1',
    });
    assert.equal(passwordLogin.status, 200);
    assert.equal(passwordLogin.body.user.id, userId);

    const session = await request.agent(app)
        .post('/api/auth/login')
        .send({ email, password: 'settings-password-1' })
        .then((res) => res.headers['set-cookie'])
        .then((cookies) => request(app).get('/api/auth/session').set('Cookie', cookies));
    assert.equal(session.status, 200);
    assert.equal(session.body.user.id, userId);

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
