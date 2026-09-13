const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');
const { configuredOrigins, isAllowedOrigin, publicAppOrigin, requestOrigin } = require('../src/publicAccess');

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
    assert.deepEqual(configuredOrigins(), ['http://localhost:5173']);
    assert.equal(requestOrigin(req), 'https://allmodelai.onrender.com');
    assert.equal(isAllowedOrigin('https://allmodelai.onrender.com', req), true);
    assert.equal(isAllowedOrigin('http://allmodelai.onrender.com', req), true);
    assert.equal(isAllowedOrigin('https://evil.example', req), false);
    assert.equal(publicAppOrigin(req), 'https://allmodelai.onrender.com');
    process.env.PUBLIC_URL = 'https://allmodelai.example';
    assert.equal(publicAppOrigin(req), 'https://allmodelai.example');
    delete process.env.PUBLIC_URL;
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
