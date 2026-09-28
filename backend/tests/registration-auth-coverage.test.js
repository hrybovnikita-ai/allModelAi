const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.DB_FILE = path.join(os.tmpdir(), `allmodelai-reg-cover-${process.pid}-${Date.now()}.sqlite`);
const app = require('../app');

after(() => {
    try { fs.rmSync(process.env.DB_FILE, { force: true }); } catch { /* ignore */ }
    app.locals.db.close();
});

test('unknown user login returns 401 without creating an account in production mode', async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
        const response = await request(app).post('/api/auth/login').send({
            email: 'nobody@example.com',
            password: 'unknown-user-password',
        });
        assert.equal(response.status, 401);
    } finally {
        process.env.NODE_ENV = prev;
    }
});

test('logout clears session and blocks protected routes', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/register').send({
        name: 'Logout User',
        email: 'logout-cover@example.com',
        password: 'logout-password',
    });
    assert.equal((await agent.get('/api/auth/session')).status, 200);
    const logout = await agent.post('/api/auth/logout');
    assert.ok([200, 204].includes(logout.status), `unexpected logout status ${logout.status}`);
    assert.equal((await agent.get('/api/auth/session')).status, 401);
    assert.equal((await agent.get('/api/credits')).status, 401);
});

test('registration defaults remember-me cookie lifetime when omitted', async () => {
    const response = await request(app).post('/api/auth/register').send({
        name: 'Remember Default',
        email: 'remember-default@example.com',
        password: 'remember-password',
    });
    assert.equal(response.status, 201);
    assert.match(response.headers['set-cookie']?.[0] || '', /Max-Age=2592000/);
});
