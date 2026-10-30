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

test('Firebase password exchange never persists an unverified client-supplied password', async () => {
    const agent = request.agent(app);
    const email = 'firebase-only@example.com';
    const result = await firebasePasswordLogin(agent, email, { passwordSync: 'ArbitraryWrongPassword1!' });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(result.body.user.id);
    assert.equal(row.password_hash, null);
    const rejected = await request(app).post('/api/auth/login').send({ email, password: 'ArbitraryWrongPassword1!' });
    assert.equal(rejected.status, 401);
    assert.equal((await agent.get('/api/auth/session')).body.user.id, result.body.user.id);
});

test('Firebase password cannot implicitly take over an existing account', async () => {
    const email = 'existing-local@example.com';
    const owner = await request(app).post('/api/auth/register').send({ name: 'Owner', email, password: 'OriginalPassword1!' });
    assert.equal(owner.status, 201);
    const before = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(owner.body.user.id).password_hash;
    const result = await firebasePasswordLogin(request.agent(app), email, { passwordSync: 'WrongPassword1!' });
    assert.equal(result.status, 409);
    assert.equal(result.body.code, 'ACCOUNT_LINK_REQUIRED');
    assert.equal(db.prepare('SELECT password_hash FROM users WHERE id = ?').get(owner.body.user.id).password_hash, before);
});

test('a local password reset takes precedence over an already linked Firebase password', async () => {
    const email = 'reset-precedence@example.com';
    const first = await firebasePasswordLogin(request.agent(app), email);
    assert.equal(first.status, 200);
    const { hashPassword } = require('../src/password');
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await hashPassword('NewLocalPassword1!'), first.body.user.id);
    const agent = request.agent(app);
    const oldFirebase = await firebasePasswordLogin(agent, email);
    assert.equal(oldFirebase.status, 401);
    assert.equal((await agent.get('/api/auth/session')).body.user, null);
    const current = await request(app).post('/api/auth/login').send({ email, password: 'NewLocalPassword1!' });
    assert.equal(current.status, 200);
});

