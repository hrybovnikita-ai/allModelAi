const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../app');

test('GET /api/health is a lightweight liveness probe', async () => {
    const response = await request(app).get('/api/health');
    assert.equal(response.status, 200);
    assert.equal(response.body.status, 'ok');
    assert.equal(response.body.service, 'allmodelai-backend');
    assert.ok(response.body.timestamp);
    assert.equal(response.body.checks, undefined);
    assert.equal(response.body.database, undefined);
});

test('GET /api/ready verifies database and session signing configuration', async () => {
    const response = await request(app).get('/api/ready');
    assert.ok([200, 503].includes(response.status));
    assert.ok(response.body.database);
    assert.ok(response.body.checks);
    assert.equal(typeof response.body.checks.sessionSigning, 'boolean');
    if (response.status === 200) {
        assert.equal(response.body.status, 'ready');
        assert.equal(response.body.database.connected, true);
    }
});

test('GET /api/health/detailed includes legacy dependency checks', async () => {
    const response = await request(app).get('/api/health/detailed');
    assert.ok([200, 503].includes(response.status));
    assert.ok(response.body.checks);
    assert.equal(typeof response.body.checks.database, 'boolean');
});

test('admin ops dashboard requires ADMIN_KEY', async () => {
    const response = await request(app).get('/api/admin/ops/dashboard');
    assert.ok([401, 503].includes(response.status));
});
