const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.ADMIN_KEY = 'test-admin-key';
process.env.FRONTEND_ORIGIN = 'http://localhost:5173';
process.env.DB_FILE = path.join(os.tmpdir(), `allmodelai-api-perf-${process.pid}-${Date.now()}.sqlite`);

const {
    recordHttpRequest,
    summarizeApiPerformance,
    resetForTests,
} = require('../src/services/operationalMetrics');
const { resetForTests: resetRateStats } = require('../src/services/rateLimitStats');

const app = require('../app');

after(() => {
    app.locals.db.close();
    fs.rmSync(process.env.DB_FILE, { force: true });
});

test('summarizeApiPerformance tracks status buckets and rpm', () => {
    resetForTests();
    recordHttpRequest({ method: 'GET', path: '/api/chat/history', statusCode: 200, durationMs: 40, responseBytes: 1200 });
    recordHttpRequest({ method: 'GET', path: '/api/chat/history', statusCode: 401, durationMs: 10, responseBytes: 80 });
    recordHttpRequest({ method: 'POST', path: '/api/chat', statusCode: 429, durationMs: 5, responseBytes: 60 });
    recordHttpRequest({ method: 'POST', path: '/api/chat', statusCode: 500, durationMs: 200, responseBytes: 90 });
    const summary = summarizeApiPerformance(60_000);
    assert.ok(summary.requestCount >= 4);
    assert.equal(summary.statusCounts[200], 1);
    assert.equal(summary.statusCounts[401], 1);
    assert.equal(summary.statusCounts[429], 1);
    assert.equal(summary.statusCounts[500], 1);
    assert.ok(Array.isArray(summary.rpmSeries));
    assert.ok(summary.failingRoutes.length >= 1);
});

test('GET /api/admin/ops/api-performance requires admin key', async () => {
    resetRateStats();
    const denied = await request(app).get('/api/admin/ops/api-performance');
    assert.equal(denied.status, 401);
    const ok = await request(app)
        .get('/api/admin/ops/api-performance')
        .set('x-admin-key', 'test-admin-key');
    assert.equal(ok.status, 200);
    assert.ok(ok.body.http);
    assert.ok(ok.body.rateLimits);
    assert.ok('postgresQueryTraffic' in ok.body);
});
