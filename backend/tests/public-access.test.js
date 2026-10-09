const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');
const { configuredOrigins, isAllowedOrigin, isNativeAppOrigin, publicAppOrigin, requestOrigin } = require('../src/publicAccess');

process.env.NODE_ENV = 'test';
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'allmodelai-public-'));
process.env.DB_FILE = path.join(directory, 'database.sqlite');
const app = require('../app');

after(() => {
    app.locals.db.close();
    fs.rmSync(directory, { recursive: true, force: true });
});

test('cloud origin helpers accept the live host even when FRONTEND_ORIGIN stays local', () => {
    process.env.FRONTEND_ORIGIN = 'http://localhost:5173';
    delete process.env.PUBLIC_URL;
    const req = {
        protocol: 'https',
        get: (name) => ({ host: 'allmodelai.onrender.com', 'x-forwarded-proto': 'https' }[name]),
    };
    assert.ok(configuredOrigins().includes('http://localhost:5173'));
    assert.ok(configuredOrigins().includes('https://localhost'));
    assert.equal(requestOrigin(req), 'https://allmodelai.onrender.com');
    assert.equal(isAllowedOrigin('https://allmodelai.onrender.com', req), true);
    assert.equal(isAllowedOrigin('http://allmodelai.onrender.com', req), true);
    assert.equal(isAllowedOrigin('https://evil.example', req), false);
    assert.equal(publicAppOrigin(req), 'https://allmodelai.onrender.com');
    process.env.PUBLIC_URL = 'https://allmodelai.example';
    assert.equal(publicAppOrigin(req), 'https://allmodelai.example');
    delete process.env.PUBLIC_URL;
});

test('Capacitor native WebView origins are allowed for credentialed API calls', async () => {
    const response = await request(app)
        .get('/api/health')
        .set('Origin', 'https://localhost');
    assert.equal(response.status, 200);
    assert.equal(response.headers['access-control-allow-origin'], 'https://localhost');
    assert.equal(response.headers['access-control-allow-credentials'], 'true');
    assert.equal(isNativeAppOrigin('capacitor://localhost'), true);
});

test('production Vercel frontend is allowed even when FRONTEND_ORIGIN is unset on Render', async () => {
    delete process.env.FRONTEND_ORIGIN;
    delete process.env.PUBLIC_URL;
    const origin = 'https://all-model-ai.vercel.app';
    const response = await request(app)
        .get('/api/health')
        .set('Origin', origin);
    assert.equal(response.status, 200);
    assert.equal(response.headers['access-control-allow-origin'], origin);
    assert.equal(response.headers['access-control-allow-credentials'], 'true');
});

test('custom production domains are allowed even when FRONTEND_ORIGIN is unset on Render', async () => {
    delete process.env.FRONTEND_ORIGIN;
    delete process.env.PUBLIC_URL;
    for (const origin of [
        'https://all-model-ai.com',
        'https://www.all-model-ai.com',
        'https://allmodelai.com',
        'https://www.allmodelai.com',
    ]) {
        const response = await request(app)
            .get('/api/health')
            .set('Origin', origin);
        assert.equal(response.status, 200, origin);
        assert.equal(response.headers['access-control-allow-origin'], origin);
        assert.equal(response.headers['access-control-allow-credentials'], 'true');
    }
});

test('API answers chat-session requests from the same public host used by phones', async () => {
    process.env.FRONTEND_ORIGIN = 'http://localhost:5173';
    const origin = 'https://allmodelai.onrender.com';
    const response = await request(app)
        .get('/api/health')
        .set('Origin', origin)
        .set('Host', 'allmodelai.onrender.com');
    assert.equal(response.status, 200);
    assert.equal(response.headers['access-control-allow-origin'], origin);
    assert.equal(response.headers['access-control-allow-credentials'], 'true');
    const blocked = await request(app)
        .get('/api/health')
        .set('Origin', 'https://evil.example')
        .set('Host', 'allmodelai.onrender.com');
    assert.equal(blocked.headers['access-control-allow-origin'], undefined);
});
