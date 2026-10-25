'use strict';

/**
 * Regression coverage for email/password login (401 vs 200) and session lifecycle.
 * Uses isolated SQLite via test-preload (DATABASE_URL unset).
 */

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.DB_FILE = path.join(os.tmpdir(), `allmodelai-login-regression-${process.pid}-${Date.now()}.sqlite`);
const app = require('../app');

after(() => {
    try { fs.rmSync(process.env.DB_FILE, { force: true }); } catch { /* ignore */ }
});

test('register → login → session → logout → login again', async () => {
    const email = `reg-login-${Date.now()}@example.com`;
    const password = 'RegressionPass1!';
    const agent = request.agent(app);

    const register = await agent.post('/api/auth/register').send({
        name: 'Regression User',
        email,
        password,
        rememberMe: true,
    });
    assert.equal(register.status, 201, register.body?.message);

    const login = await agent.post('/api/auth/login').send({ email, password, rememberMe: true });
    assert.equal(login.status, 200, login.body?.message);
    assert.equal(login.body.user?.email, email.toLowerCase());

    const session = await agent.get('/api/auth/session');
    assert.equal(session.status, 200);
    assert.equal(session.body.authenticated, true);
    assert.equal(session.body.user?.email, email.toLowerCase());

    const logout = await agent.post('/api/auth/logout');
    assert.ok(logout.status === 200 || logout.status === 204);

    const guest = await agent.get('/api/auth/session');
    assert.equal(guest.body.authenticated, false);

    const relogin = await agent.post('/api/auth/login').send({ email, password });
    assert.equal(relogin.status, 200);
});

test('wrong password and unknown email both return 401 INVALID_CREDENTIALS', async () => {
    const email = `creds-${Date.now()}@example.com`;
    const password = 'KnownGoodPass1!';

    assert.equal(
        (await request(app).post('/api/auth/register').send({
            name: 'Cred Test',
            email,
            password,
        })).status,
        201,
    );

    const badPass = await request(app).post('/api/auth/login').send({
        email,
        password: 'WrongPassword99!',
    });
    assert.equal(badPass.status, 401);
    assert.equal(badPass.body.code, 'INVALID_CREDENTIALS');

    const unknown = await request(app).post('/api/auth/login').send({
        email: `missing-${Date.now()}@example.com`,
        password,
    });
    assert.equal(unknown.status, 401);
    assert.equal(unknown.body.code, 'INVALID_CREDENTIALS');
});

test('Account without password hash returns PASSWORD_SETUP_REQUIRED', async () => {
    const email = `no-hash-${Date.now()}@example.com`;
    const db = app.locals.db.database;
    db.prepare(
        'INSERT INTO users (name, email, password_hash, email_verified) VALUES (?, ?, ?, ?)',
    ).run('No Hash', email, null, 1);

    const login = await request(app).post('/api/auth/login').send({
        email,
        password: 'AnyPassword1!',
    });
    assert.equal(login.status, 401);
    assert.equal(login.body.code, 'PASSWORD_SETUP_REQUIRED');
    assert.match(login.body.message, /forgot password/i);
});

test('login email normalization accepts mixed case and surrounding spaces', async () => {
    const email = `normalize-${Date.now()}@example.com`;
    const password = 'NormalizePass1!';

    await request(app).post('/api/auth/register').send({
        name: 'Norm',
        email,
        password,
    });

    const login = await request(app).post('/api/auth/login').send({
        email: `  ${email.toUpperCase()}  `,
        password,
    });
    assert.equal(login.status, 200);
});
