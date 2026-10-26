const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.FRONTEND_ORIGIN = 'http://localhost:5173';
process.env.DB_FILE = path.join(os.tmpdir(), `allmodelai-firebase-email-${process.pid}-${Date.now()}.sqlite`);

const app = require('../app');
const admin = require('../src/firebaseAdmin');
const db = app.locals.db.database;

const verified = new Map();
const originalVerify = admin.verifySocialToken;
admin.verifySocialToken = async (token) => {
    if (!verified.has(token)) throw Object.assign(new Error('Rejected'), { code: 'auth/id-token-expired' });
    return verified.get(token);
};

function passwordToken(key, email, overrides = {}) {
    verified.set(key, {
        uid: `firebase-${key}`,
        sub: `firebase-${key}`,
        auth_time: Math.floor(Date.now() / 1000),
        email,
        email_verified: true,
        name: 'Email User',
        firebase: { sign_in_provider: 'password', identities: { email: [email] } },
        ...overrides,
    });
    return key;
}

const postSocial = (agent, url, data) => agent
    .post(url)
    .set('Origin', 'http://localhost:5173')
    .set('X-AllModelAI-Auth', '1')
    .send(data);

async function firebasePasswordLogin(agent, email, extra = {}) {
    const key = passwordToken(`pwd-${email}`, email);
    const challenge = await postSocial(agent, '/api/auth/firebase/challenge', { intent: 'login' });
    assert.equal(challenge.status, 200);
    return postSocial(agent, '/api/auth/firebase', {
        idToken: key,
        state: challenge.body.state,
        intent: 'login',
        ...extra,
    });
}

after(() => {
    admin.verifySocialToken = originalVerify;
    app.locals.db.close();
    fs.rmSync(process.env.DB_FILE, { force: true });
});

test('Firebase password token links to existing Google account and can persist backend hash', async () => {
    const email = 'dual-firebase@example.com';
    const googleKey = `g-${email}`;
    verified.set(googleKey, {
        uid: `firebase-${googleKey}`,
        auth_time: Math.floor(Date.now() / 1000),
        email,
        email_verified: true,
        name: 'Dual User',
        firebase: { sign_in_provider: 'google.com', identities: { 'google.com': [googleKey] } },
    });
    const agent = request.agent(app);
    const googleChallenge = await postSocial(agent, '/api/auth/firebase/challenge', { intent: 'login' });
    const google = await postSocial(agent, '/api/auth/firebase', {
        idToken: googleKey,
        state: googleChallenge.body.state,
        intent: 'login',
    });
    assert.equal(google.status, 200);
    const userId = google.body.user.id;

    const blocked = await request(app).post('/api/auth/login').send({
        email,
        password: 'AllModelPass1!',
    });
    assert.equal(blocked.status, 401);
    assert.equal(blocked.body.code, 'PASSWORD_SETUP_REQUIRED');

    const exchanged = await firebasePasswordLogin(request.agent(app), email, {
        passwordSync: 'AllModelPass1!',
    });
    assert.equal(exchanged.status, 200);
    assert.equal(exchanged.body.user.id, userId);

    const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId);
    assert.ok(row?.password_hash, 'password hash should persist after Firebase password exchange');

    const backendLogin = await request(app).post('/api/auth/login').send({
        email,
        password: 'AllModelPass1!',
    });
    assert.equal(backendLogin.status, 200);
    assert.equal(backendLogin.body.user.id, userId);
});
