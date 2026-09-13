const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');
process.env.NODE_ENV = 'test';
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'allmodelai-devices-'));
process.env.DB_FILE = path.join(directory, 'database.sqlite');
const app = require('../app');
const { connectDatabase } = require('../src/db');
const { sessionCookieOptions } = require('../src/sessionCookie');
after(() => {
    app.locals.db.close();
    fs.rmSync(directory, { recursive: true, force: true });
});

test('two devices share one account and history while keeping independent sessions', async () => {
    process.env.NODE_ENV = 'production';
    process.env.COOKIE_SECURE = 'false';
    const desktop = request.agent(app);
    const phone = request.agent(app);
    const account = { name: 'Device User', email: 'devices@example.com', password: 'DeviceTest123!', rememberMe: true };
    try {
        const registered = await desktop.post('/api/auth/register').send(account);
        assert.equal(registered.status, 201);
        assert.doesNotMatch(registered.headers['set-cookie'][0], /; Secure/i);
        assert.match(registered.headers['set-cookie'][0], /HttpOnly/);
        assert.match(registered.headers['set-cookie'][0], /Max-Age=/);
        const login = await phone.post('/api/auth/login').send(account);
        assert.equal(login.status, 200);
        assert.equal(login.body.user.id, registered.body.user.id);
        assert.notEqual(login.headers['set-cookie'][0], registered.headers['set-cookie'][0]);
        const chat = await desktop.post('/api/chat/history').send({ model: 'gpt', messages: [{ role: 'user', text: 'Shared between devices' }] });
        assert.equal(chat.status, 201);
        for (const client of [desktop, phone]) {
            assert.equal((await client.get('/api/auth/session')).status, 200);
            const history = await client.get('/api/chat/history');
            assert.equal(history.status, 200);
            assert.ok(history.body.some(row => row.id === chat.body.id));
        }
        app.locals.db.close();
        app.locals.db = connectDatabase();
        assert.equal((await desktop.get('/api/auth/session')).status, 200);
        assert.equal((await phone.get('/api/auth/session')).status, 200);
        assert.equal((await desktop.post('/api/auth/logout')).status, 204);
        assert.equal((await desktop.get('/api/auth/session')).status, 401);
        assert.equal((await phone.get('/api/auth/session')).status, 200);
    } finally {
        process.env.NODE_ENV = 'test';
        delete process.env.COOKIE_SECURE;
    }
});

test('public production uses secure cookies unless local HTTP is explicitly configured', () => {
    process.env.NODE_ENV = 'production';
    try {
        assert.equal(sessionCookieOptions().secure, true);
        process.env.COOKIE_SECURE = 'false';
        assert.equal(sessionCookieOptions().secure, false);
        process.env.COOKIE_SECURE = 'true';
        assert.equal(sessionCookieOptions().secure, true);
        process.env.COOKIE_SECURE = 'invalid';
        assert.throws(sessionCookieOptions, /COOKIE_SECURE/);
    } finally {
        process.env.NODE_ENV = 'test';
        delete process.env.COOKIE_SECURE;
    }
});
