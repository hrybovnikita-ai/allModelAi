const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');
const {
    ALL_MODEL_AI_VERCEL_PRODUCTION,
    CORS_ALLOWED_METHODS,
    isAllModelAiVercelProjectOrigin,
    isAllowedOrigin,
} = require('../src/corsPolicy');

process.env.NODE_ENV = 'test';
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'allmodelai-cors-'));
process.env.DB_FILE = path.join(directory, 'database.sqlite');
const app = require('../app');

after(() => {
    app.locals.db.close();
    fs.rmSync(directory, { recursive: true, force: true });
});

test('allows production AllModelAI Vercel origin with credentials', async () => {
    const response = await request(app)
        .get('/api/health')
        .set('Origin', ALL_MODEL_AI_VERCEL_PRODUCTION);
    assert.equal(response.status, 200);
    assert.equal(response.headers['access-control-allow-origin'], ALL_MODEL_AI_VERCEL_PRODUCTION);
    assert.equal(response.headers['access-control-allow-credentials'], 'true');
    assert.match(String(response.headers.vary || ''), /Origin/i);
});

test('allows AllModelAI Vercel preview deployments over HTTPS', async () => {
    const preview = 'https://all-model-ai-git-main-example.vercel.app';
    assert.equal(isAllModelAiVercelProjectOrigin(preview), true);
    const response = await request(app)
        .get('/api/health')
        .set('Origin', preview);
    assert.equal(response.status, 200);
    assert.equal(response.headers['access-control-allow-origin'], preview);
    assert.equal(response.headers['access-control-allow-credentials'], 'true');
});

test('OPTIONS preflight returns CORS headers for credentialed API calls', async () => {
    const response = await request(app)
        .options('/api/auth/session')
        .set('Origin', ALL_MODEL_AI_VERCEL_PRODUCTION)
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'content-type, authorization');
    assert.equal(response.status, 204);
    assert.equal(response.headers['access-control-allow-origin'], ALL_MODEL_AI_VERCEL_PRODUCTION);
    assert.equal(response.headers['access-control-allow-credentials'], 'true');
    for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
        assert.ok(
            CORS_ALLOWED_METHODS.includes(method),
            `expected method ${method} in allow list`,
        );
    }
    const allowMethods = String(response.headers['access-control-allow-methods'] || '');
    assert.match(allowMethods, /POST/);
    assert.match(allowMethods, /OPTIONS/);
    const allowHeaders = String(response.headers['access-control-allow-headers'] || '').toLowerCase();
    assert.match(allowHeaders, /content-type/);
    assert.match(allowHeaders, /authorization/);
});

test('rejects arbitrary untrusted browser origins', async () => {
    const req = { get: () => 'api.example.com' };
    assert.equal(isAllowedOrigin('https://evil.example', req), false);
    const response = await request(app)
        .get('/api/health')
        .set('Origin', 'https://evil.example')
        .set('Host', 'api.example.com');
    assert.equal(response.status, 200);
    assert.equal(response.headers['access-control-allow-origin'], undefined);
    assert.notEqual(response.headers['access-control-allow-origin'], '*');
});

test('rejects unrelated vercel.app origins', () => {
    assert.equal(isAllModelAiVercelProjectOrigin('https://other-project.vercel.app'), false);
    assert.equal(isAllModelAiVercelProjectOrigin('http://all-model-ai.vercel.app'), false);
});

test('existing API routes still respond after CORS middleware', async () => {
    const response = await request(app).get('/api/health');
    assert.equal(response.status, 200);
    assert.equal(typeof response.body?.status === 'string' || response.body?.ok === true || response.status === 200, true);
});
