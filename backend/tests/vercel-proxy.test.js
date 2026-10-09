const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const request = require('supertest');
const { createVercelProxy, proxyFailureCode } = require('../src/vercelProxy');

process.env.NODE_ENV = 'test';
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'allmodelai-proxy-'));
process.env.DB_FILE = path.join(directory, 'database.sqlite');
const app = require('../app');
after(() => {
    app.locals.db.close();
    fs.rmSync(directory, { recursive: true, force: true });
});

test('separate Vercel proxy instances share durable sessions and logout revocation', async () => {
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    try {
        const origin = `http://127.0.0.1:${server.address().port}`;
        const first = createVercelProxy({ origin, allowHttp: true });
        const second = createVercelProxy({ origin, allowHttp: true });
        const response = await request(first).post('/api/auth/register')
            .set('Host', 'allmodelai.example').set('Origin', 'https://allmodelai.example')
            .set('X-Forwarded-Proto', 'https')
            .send({ name: 'Proxy User', email: 'proxy@example.com', password: 'test-password' });
        assert.equal(response.status, 201);
        assert.equal(response.headers['access-control-allow-origin'], 'https://allmodelai.example');
        const cookie = response.headers['set-cookie'][0].split(';')[0];
        assert.equal((await request(second).get('/api/auth/session').set('Cookie', cookie)).status, 200);
        const saved = await request(second).post('/api/chat/history').set('Cookie', cookie)
            .send({ model: 'gemini', messages: [{ role: 'user', text: 'Preserved conversation' }] });
        assert.equal(saved.status, 201);
        assert.equal((await request(first).get('/api/chat/history').set('Cookie', cookie)).body[0].id, saved.body.id);
        assert.equal((await request(second).post('/api/auth/logout').set('Cookie', cookie)).status, 204);
        const guest = await request(first).get('/api/auth/session').set('Cookie', cookie);
        assert.equal(guest.status, 200);
        assert.equal(guest.body.user, null);
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
});

test('proxy preserves SSE, multiple cookies and request payloads', async () => {
    const http = require('node:http');
    const server = http.createServer((req, res) => {
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', () => {
            assert.equal(body, '{"message":"hello"}');
            assert.equal(req.headers.cookie, 'allmodelai_session=test');
            res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Set-Cookie': ['one=1; HttpOnly', 'two=2; HttpOnly'] });
            res.write('data: first\n\n');
            res.end('data: second\n\n');
        });
    }).listen(0, '127.0.0.1');
    await once(server, 'listening');
    try {
        const proxy = createVercelProxy({ origin: `http://127.0.0.1:${server.address().port}`, allowHttp: true });
        const response = await request(proxy).post('/api/chat').set('Cookie', 'allmodelai_session=test').send({ message: 'hello' });
        assert.equal(response.text, 'data: first\n\ndata: second\n\n');
        assert.equal(response.headers['set-cookie'].length, 2);
        assert.equal(response.headers['cache-control'], 'no-store');
    } finally { await new Promise((resolve) => server.close(resolve)); }
});

test('login POST through proxy forwards 200 and Set-Cookie from Render backend', async () => {
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    try {
        const origin = `http://127.0.0.1:${server.address().port}`;
        const proxy = createVercelProxy({ origin, allowHttp: true });
        await request(app).post('/api/auth/register').send({
            name: 'Proxy Login',
            email: 'proxy-login@example.com',
            password: 'test-password',
        });
        const login = await request(proxy)
            .post('/api/auth/login')
            .set('Host', 'all-model-ai.vercel.app')
            .set('Origin', 'https://all-model-ai.vercel.app')
            .set('X-Forwarded-Proto', 'https')
            .send({ email: 'proxy-login@example.com', password: 'test-password' });
        assert.equal(login.status, 200);
        assert.ok(login.headers['set-cookie']);
        assert.match(login.headers['set-cookie'][0], /allmodelai_session=/);
        const cookie = login.headers['set-cookie'][0].split(';')[0];
        const session = await request(proxy)
            .get('/api/auth/session')
            .set('Host', 'all-model-ai.vercel.app')
            .set('Cookie', cookie);
        assert.equal(session.status, 200);
        assert.equal(session.body.user.email, 'proxy-login@example.com');
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
});

test('proxy timeout maps to PROXY_TIMEOUT failure code', () => {
    assert.equal(proxyFailureCode(new Error('Backend timed out')), 'PROXY_TIMEOUT');
    assert.equal(proxyFailureCode(new Error('ECONNRESET')), 'UPSTREAM_CONNECTION_FAILED');
});

test('missing, unsafe or looping backend configuration is a service failure, not logout', async () => {
    for (const origin of ['', 'http://insecure.example', 'https://user:password@example.com', 'https://example.com/path']) {
        const response = await request(createVercelProxy({ origin })).get('/api/auth/session');
        assert.equal(response.status, 503);
        assert.equal(response.headers['set-cookie'], undefined);
    }
    const loop = await request(createVercelProxy({ origin: 'https://example.com' }))
        .get('/api/auth/session').set('X-AllModelAI-Proxy-Hop', '1');
    assert.equal(loop.status, 503);
    const previous = process.env.VERCEL;
    try {
        process.env.VERCEL = '1';
        assert.throws(() => require('../src/db').connectDatabase(), /cannot persist SQLite/);
    } finally {
        if (previous === undefined) delete process.env.VERCEL;
        else process.env.VERCEL = previous;
    }
});
