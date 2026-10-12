const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const {
    getPublicModelStatus,
    resetModelStatusCacheForTests,
} = require('../src/services/modelStatusService');

beforeEach(() => {
    resetModelStatusCacheForTests();
});

test('getPublicModelStatus returns env snapshot without live probes', () => {
    const first = getPublicModelStatus();
    assert.equal(first.cacheHit, false);
    assert.ok(first.body.models);
    assert.ok(first.body.providers);
    assert.ok(first.body.variants && typeof first.body.variants === 'object');

    const second = getPublicModelStatus();
    assert.equal(second.cacheHit, true);
    assert.deepEqual(second.body, first.body);
});

test('GET /api/status/models responds quickly with X-Cache', async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-for-model-status';
    if (!process.env.DB_FILE) {
        const crypto = require('node:crypto');
        const os = require('node:os');
        const path = require('node:path');
        process.env.DB_FILE = path.join(os.tmpdir(), `allmodelai-model-status-${crypto.randomUUID()}.sqlite`);
    }
    const app = require('../app');
    const started = Date.now();
    const first = await request(app).get('/api/status/models').timeout({ deadline: 3000 });
    const second = await request(app).get('/api/status/models').timeout({ deadline: 3000 });
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(first.headers['x-cache'], 'MISS');
    assert.equal(second.headers['x-cache'], 'HIT');
    assert.ok(Date.now() - started < 2500, 'model status should not hang on cold request');
});
