const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');

process.env.NODE_ENV = 'test';
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'allmodelai-persistence-'));
process.env.DB_FILE = path.join(directory, 'database.sqlite');
const app = require('../app');
after(() => {
    app.locals.db.close();
    fs.rmSync(directory, { recursive: true, force: true });
});

for (const method of ['register', 'login']) {
    test(`${method} -> refresh -> browser restart restores the HttpOnly session without storage`, async () => {
        const account = { name: 'Persistent User', email: `${method}@persistence.example`, password: 'test-password' };
        if (method === 'login') assert.equal((await request(app).post('/api/auth/register').send(account)).status, 201);
        const result = await request(app).post(`/api/auth/${method}`).send(account);
        assert.equal(result.status, method === 'register' ? 201 : 200);
        const cookie = result.headers['set-cookie'][0];
        assert.match(cookie, /Max-Age=2592000/);
        assert.match(cookie, /HttpOnly/);
        assert.match(cookie, /Path=\//);
        assert.equal(result.body.token, undefined);
        assert.equal(result.body.user.passwordHash, undefined);
        const previousFetch = global.fetch;
        const storageDescriptors = Object.fromEntries(['localStorage', 'sessionStorage'].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
        for (const key of Object.keys(storageDescriptors)) Object.defineProperty(globalThis, key, { configurable: true, get() { throw new Error('Storage unavailable'); } });
        global.fetch = async (url, options) => {
            assert.equal(options.credentials, 'include');
            const response = await request(app).get(url).set('Cookie', cookie.split(';')[0]);
            return new Response(JSON.stringify(response.body), { status: response.status });
        };
        try {
            const session = await import(`../../frontend/src/lib/session.js?${method}-login`);
            assert.equal((await session.confirmSession(result.body.user)).email, account.email);
            for (const phase of ['refresh', 'restart']) {
                const freshSession = await import(`../../frontend/src/lib/session.js?${method}-${phase}`);
                assert.equal((await freshSession.restoreSession()).email, account.email);
            }
        } finally {
            global.fetch = previousFetch;
            for (const [key, descriptor] of Object.entries(storageDescriptors)) {
                if (descriptor) Object.defineProperty(globalThis, key, descriptor);
                else delete globalThis[key];
            }
        }
        app.locals.db.close();
        app.locals.db = require('../src/db').connectDatabase();
        assert.equal((await request(app).get('/api/auth/session').set('Cookie', cookie.split(';')[0])).status, 200);
        assert.equal((await request(app).post('/api/auth/logout').set('Cookie', cookie.split(';')[0])).status, 204);
        assert.equal((await request(app).get('/api/auth/session').set('Cookie', cookie.split(';')[0])).status, 401);
    });
}

test('expired and malformed cookies are rejected by session and protected endpoints', async () => {
    const response = await request(app).post('/api/auth/register').send({ name: 'Expired', email: 'expired@persistence.example', password: 'test-password' });
    const cookie = response.headers['set-cookie'][0].split(';')[0];
    app.locals.db.database.prepare('UPDATE auth_sessions SET expires_at = 0').run();
    for (const value of [cookie, 'allmodelai_session=invalid']) {
        for (const endpoint of ['/api/auth/session', '/api/chat/history']) {
            assert.equal((await request(app).get(endpoint).set('Cookie', value)).status, 401);
        }
    }
});

test('a matching name cannot reset a password through login', async () => {
    const account = { name: 'Private User', email: 'private@persistence.example', password: 'original-password' };
    await request(app).post('/api/auth/register').send(account);
    assert.equal((await request(app).post('/api/auth/login').send({ ...account, password: 'wrong-password' })).status, 401);
    assert.equal((await request(app).post('/api/auth/login').send(account)).status, 200);
});

test('production cookie attributes and exact credentialed CORS origins', async () => {
    const previous = Object.fromEntries(['NODE_ENV', 'COOKIE_SECURE', 'FRONTEND_ORIGIN'].map((key) => [key, process.env[key]]));
    try {
        process.env.NODE_ENV = 'production';
        delete process.env.COOKIE_SECURE;
        process.env.FRONTEND_ORIGIN = 'https://app.example.com';
        const response = await request(app).post('/api/auth/register')
            .set('Origin', 'https://app.example.com').set('X-Forwarded-Proto', 'https')
            .send({ name: 'HTTPS User', email: 'https@persistence.example', password: 'test-password' });
        assert.equal(response.status, 201);
        assert.match(response.headers['set-cookie'][0], /; Secure/);
        assert.match(response.headers['set-cookie'][0], /; HttpOnly/);
        assert.match(response.headers['set-cookie'][0], /; SameSite=Lax/);
        assert.match(response.headers['set-cookie'][0], /; Path=\//);
        assert.doesNotMatch(response.headers['set-cookie'][0], /Domain=/);
        assert.equal(response.headers['access-control-allow-origin'], 'https://app.example.com');
        assert.equal(response.headers['access-control-allow-credentials'], 'true');
        assert.equal(app.get('trust proxy'), 1);
        const blocked = await request(app).get('/api/auth/session').set('Origin', 'https://untrusted.example');
        assert.equal(blocked.headers['access-control-allow-origin'], undefined);
        const logout = await request(app).post('/api/auth/logout');
        assert.match(logout.headers['set-cookie'][0], /; Secure/);
        assert.match(logout.headers['set-cookie'][0], /; SameSite=Lax/);
    } finally {
        for (const [key, value] of Object.entries(previous)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
    }
});
