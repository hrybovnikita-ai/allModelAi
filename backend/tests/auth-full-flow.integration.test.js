'use strict';

/**
 * End-to-end auth flows: register/login, Google-only, password setup, session persistence.
 */

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.DB_FILE = path.join(os.tmpdir(), `allmodelai-auth-full-${process.pid}-${Date.now()}.sqlite`);
delete process.env.EXPOSE_ACCOUNT_TOKENS;

const app = require('../app');

after(() => {
    try {
        app.locals.db.close();
        fs.rmSync(process.env.DB_FILE, { force: true });
    } catch {
        /* ignore */
    }
});

test('email/password register → login → session → logout → login again', async () => {
    const email = `full-reg-${Date.now()}@example.com`;
    const password = 'FullFlowPass1!';
    const agent = request.agent(app);

    const register = await agent.post('/api/auth/register').send({
        name: 'Full Flow',
        email,
        password,
        confirmPassword: password,
        rememberMe: true,
    });
    assert.equal(register.status, 201, register.body?.message);

    const session = await agent.get('/api/auth/session');
    assert.equal(session.body.authenticated, true);

    await agent.post('/api/auth/logout');
    assert.equal((await agent.get('/api/auth/session')).body.authenticated, false);

    const relogin = await agent.post('/api/auth/login').send({ email, password, rememberMe: true });
    assert.equal(relogin.status, 200);
    assert.equal((await agent.get('/api/auth/session')).body.authenticated, true);
});

test('Google-only account: password login rejected, reset sets password, email login works', async () => {
    const admin = require('../src/firebaseAdmin');
    const verified = new Map();
    const originalVerify = admin.verifySocialToken;
    admin.verifySocialToken = async (token) => {
        if (!verified.has(token)) {
            throw Object.assign(new Error('Rejected'), { code: 'auth/id-token-expired' });
        }
        return verified.get(token);
    };

    try {
        const email = `google-full-${Date.now()}@example.com`;
        const key = 'google-full-key';
        verified.set(key, {
            uid: `firebase-${key}`,
            auth_time: Math.floor(Date.now() / 1000),
            email,
            email_verified: true,
            name: 'Google Full',
            firebase: { sign_in_provider: 'google.com', identities: { 'google.com': [key] } },
        });

        const agent = request.agent(app);
        const challenge = await agent.post('/api/auth/firebase/challenge')
            .set('Origin', 'http://localhost:5173')
            .set('X-AllModelAI-Auth', '1')
            .send({ intent: 'login' });
        assert.equal(challenge.status, 200);

        const google = await agent.post('/api/auth/firebase')
            .set('Origin', 'http://localhost:5173')
            .set('X-AllModelAI-Auth', '1')
            .send({ idToken: key, state: challenge.body.state, intent: 'login' });
        assert.equal(google.status, 200);
        const userId = google.body.user.id;

        await agent.post('/api/auth/logout');

        const blocked = await request(app).post('/api/auth/login').send({
            email,
            password: 'not-set-yet',
        });
        assert.equal(blocked.status, 401);
        assert.equal(blocked.body.code, 'PASSWORD_SETUP_REQUIRED');
        assert.ok(blocked.body.providers?.includes('google.com'));

        const resetReq = await request(app).post('/api/auth/password-reset/request').send({ email });
        assert.equal(resetReq.status, 200);
        assert.ok(resetReq.body.token, 'reset token must be exposed in test when email is not configured');

        const newPassword = 'GoogleLinkedPass1!';
        const confirm = await request(app).post('/api/auth/password-reset/confirm').send({
            token: resetReq.body.token,
            password: newPassword,
            confirmPassword: newPassword,
        });
        assert.equal(confirm.status, 200);

        const emailLogin = await request(app).post('/api/auth/login').send({
            email,
            password: newPassword,
        });
        assert.equal(emailLogin.status, 200);
        assert.equal(emailLogin.body.user.id, userId);

        const googleAgain = await agent.post('/api/auth/firebase/challenge')
            .set('Origin', 'http://localhost:5173')
            .set('X-AllModelAI-Auth', '1')
            .send({ intent: 'login' });
        const googleRelogin = await agent.post('/api/auth/firebase')
            .set('Origin', 'http://localhost:5173')
            .set('X-AllModelAI-Auth', '1')
            .send({ idToken: key, state: googleAgain.body.state, intent: 'login' });
        assert.equal(googleRelogin.status, 200);
        assert.equal(googleRelogin.body.user.id, userId);
    } finally {
        admin.verifySocialToken = originalVerify;
    }
});

test('signed-in Google user can enroll password in settings without duplicate account', async () => {
    const admin = require('../src/firebaseAdmin');
    const verified = new Map();
    const originalVerify = admin.verifySocialToken;
    admin.verifySocialToken = async (token) => verified.get(token);

    try {
        const email = `enroll-full-${Date.now()}@example.com`;
        const key = 'enroll-full';
        verified.set(key, {
            uid: `firebase-${key}`,
            auth_time: Math.floor(Date.now() / 1000),
            email,
            email_verified: true,
            name: 'Enroll User',
            firebase: { sign_in_provider: 'google.com', identities: { 'google.com': [key] } },
        });

        const agent = request.agent(app);
        const challenge = await agent.post('/api/auth/firebase/challenge')
            .set('Origin', 'http://localhost:5173')
            .set('X-AllModelAI-Auth', '1')
            .send({ intent: 'login' });
        const google = await agent.post('/api/auth/firebase')
            .set('Origin', 'http://localhost:5173')
            .set('X-AllModelAI-Auth', '1')
            .send({ idToken: key, state: challenge.body.state, intent: 'login' });
        assert.equal(google.status, 200);
        const userId = google.body.user.id;

        const security = await agent.get('/api/auth/account/security');
        assert.equal(security.status, 200);
        assert.equal(security.body.passwordEnabled, false);

        const password = 'EnrolledPass1!';
        const enroll = await agent.post('/api/auth/account/password').send({
            newPassword: password,
            confirmPassword: password,
        });
        assert.equal(enroll.status, 200);

        await agent.post('/api/auth/logout');

        const login = await request(app).post('/api/auth/login').send({ email, password });
        assert.equal(login.status, 200);
        assert.equal(login.body.user.id, userId);
    } finally {
        admin.verifySocialToken = originalVerify;
    }
});

test('session cookie persists across reload simulation', async () => {
    const email = `persist-${Date.now()}@example.com`;
    const password = 'PersistPass1!';
    const register = await request(app).post('/api/auth/register').send({
        name: 'Persist',
        email,
        password,
    });
    assert.equal(register.status, 201);
    const cookie = register.headers['set-cookie'][0].split(';')[0];

    const session = await request(app).get('/api/auth/session').set('Cookie', cookie);
    assert.equal(session.body.authenticated, true);

    app.locals.db.close();
    app.locals.db = require('../src/db').connectDatabase();

    const afterRestart = await request(app).get('/api/auth/session').set('Cookie', cookie);
    assert.equal(afterRestart.body.authenticated, true);
    assert.equal(afterRestart.body.user.email, email.toLowerCase());
});
