const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.FRONTEND_ORIGIN = 'http://localhost:5173';
process.env.DB_FILE = path.join(os.tmpdir(), `allmodelai-auth-analytics-${process.pid}-${Date.now()}.sqlite`);

const app = require('../app');

after(() => {
    app.locals.db.close();
    fs.rmSync(process.env.DB_FILE, { force: true });
});

test('register, login, reject wrong password, and analytics for same user', async () => {
    const email = `reg-login-${Date.now()}@example.com`;
    const password = 'correct-password-9';

    const registered = await request(app).post('/api/auth/register').send({
        name: 'Reg Login User',
        email,
        password,
    });
    assert.ok([200, 201].includes(registered.status), `register status ${registered.status}`);
    const userId = registered.body.user.id;

    const bad = await request(app).post('/api/auth/login').send({
        email,
        password: 'wrong-password-9',
    });
    assert.equal(bad.status, 401);
    assert.equal(bad.body.code, 'INVALID_CREDENTIALS');

    const agent = request.agent(app);
    const login = await agent.post('/api/auth/login').send({ email, password });
    assert.equal(login.status, 200);
    assert.equal(login.body.user.id, userId);

    const session = await agent.get('/api/auth/session');
    assert.equal(session.status, 200);
    assert.equal(session.body.user.id, userId);

    const analytics = await agent.get('/api/analytics');
    assert.equal(analytics.status, 200);
    assert.equal(analytics.body.conversations, 0);
    assert.equal(typeof analytics.body.estimatedTokens, 'number');

    await agent.post('/api/auth/logout');
    const guestAnalytics = await request(app).get('/api/analytics');
    assert.equal(guestAnalytics.status, 401);
});
