const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.ENABLE_PLUS_TEST_MODE = 'true';
process.env.DEVELOPER_EMAILS = 'owner@test.com';
process.env.DB_FILE = path.join(os.tmpdir(), `allmodelai-platform-${process.pid}.sqlite`);
process.env.API_KEY = 'test-key';
fs.rmSync(process.env.DB_FILE, { force: true });

const app = require('../app');
const { getPlatformCapabilities, assertFeatureEnabled } = require('../src/platform/featureAccess');
const { enqueuePlatformJob, getJobForUser } = require('../src/platform/platformJobService');

describe('platform phase 1 infrastructure', () => {
    let api;

    before(async () => {
        api = request.agent(app);
        await api.post('/api/auth/register').send({
            name: 'Owner',
            email: 'owner@test.com',
            password: 'test-password',
        });
    });

    after(() => {
        app.locals.db.close();
    });

    test('GET /api/platform/capabilities returns feature registry', async () => {
        const response = await api.get('/api/platform/capabilities');
        assert.equal(response.status, 200);
        assert.equal(response.body.version, 1);
        assert.ok(Array.isArray(response.body.features));
        assert.ok(response.body.features.length >= 7);
        const memory = response.body.features.find((item) => item.id === 'memory_engine');
        assert.ok(memory);
        assert.equal(memory.enabled, true);
        const code = response.body.features.find((item) => item.id === 'code_executor');
        assert.equal(code.enabled, false);
        assert.ok(response.body.infrastructure.storage.maxUploadBytes > 0);
    });

    test('platform job enqueue respects feature gates', async () => {
        const connection = app.locals.db;
        await assert.rejects(
            () => enqueuePlatformJob(connection, {
                email: 'owner@test.com',
                type: 'code_run',
                payload: {},
                access: { role: 'owner', mode: 'developer', isOwner: true },
            }),
            (error) => error.code === 'FEATURE_UNAVAILABLE',
        );

        const job = await enqueuePlatformJob(connection, {
            email: 'owner@test.com',
            type: 'kb_document_index',
            payload: { documentId: 'doc-test' },
            access: { role: 'owner', mode: 'developer', isOwner: true },
        });
        assert.match(job.id, /^pjob-/);
        const loaded = await getJobForUser(connection, job.id, 'owner@test.com');
        assert.equal(loaded.type, 'kb_document_index');
    });

    test('GET /api/platform/jobs lists only own jobs', async () => {
        const list = await api.get('/api/platform/jobs');
        assert.equal(list.status, 200);
        assert.ok(list.body.jobs.some((job) => job.type === 'kb_document_index'));
    });

    test('assertFeatureEnabled throws for disabled features', async () => {
        const capabilities = await getPlatformCapabilities(app.locals.db, 'owner@test.com', {
            role: 'owner',
            mode: 'developer',
            isOwner: true,
        });
        assert.doesNotThrow(() => assertFeatureEnabled(capabilities, 'memory_engine'));
        assert.throws(() => assertFeatureEnabled(capabilities, 'code_executor'));
    });

    test('capabilities endpoint requires auth', async () => {
        const response = await request(app).get('/api/platform/capabilities');
        assert.equal(response.status, 401);
    });
});
