const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

process.env.NODE_ENV = 'test';
process.env.ENABLE_PLUS_TEST_MODE = 'true';
process.env.DEVELOPER_EMAILS = `plus-dev-${process.pid}@example.com`;
process.env.DB_FILE = path.join(os.tmpdir(), `allmodelai-plus-test-${process.pid}.sqlite`);
fs.rmSync(process.env.DB_FILE, { force: true });

const {
    isPlusTestModeServerEnabled,
    isPlusTestEligible,
    applyPlusTestCreditStatus,
} = require('../src/billing/plusTestMode');

const app = require('../app');

async function registerAndCookie(email) {
    const res = await request(app)
        .post('/api/auth/register')
        .send({ name: 'Tester', email, password: 'Password123!' });
    assert.equal(res.status, 201);
    return res.headers['set-cookie'];
}

test('Plus Test Mode server rules', async (t) => {
    await t.test('enabled only in non-production with explicit flag', () => {
        assert.equal(isPlusTestModeServerEnabled(), true);
        const prev = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';
        assert.equal(isPlusTestModeServerEnabled(), false);
        process.env.NODE_ENV = prev;
    });

    await t.test('applyPlusTestCreditStatus grants all models when mode developer', () => {
        const status = applyPlusTestCreditStatus({
            email: process.env.DEVELOPER_EMAILS,
            plan: 'free',
            hasSubscription: false,
            savedMode: 'developer',
            models: ['smart', 'gpt'],
            enforced: true,
        });
        assert.equal(status.plusTestMode, true);
        assert.deepEqual(status.models, ['all']);
        assert.equal(status.canUseDeveloper, true);
    });

    await t.test('free user without allowlist cannot use developer mode', () => {
        const status = applyPlusTestCreditStatus({
            email: 'stranger@example.com',
            plan: 'free',
            hasSubscription: false,
            savedMode: 'developer',
            models: ['smart', 'gpt'],
            enforced: true,
        });
        assert.equal(status.plusTestMode, false);
        assert.equal(status.mode, 'user');
        assert.equal(status.canUseDeveloper, false);
    });
});

test('Plus Test Mode HTTP access', async (t) => {
    let devCookie;
    await t.test('register allowlisted developer once', async () => {
        devCookie = await registerAndCookie(process.env.DEVELOPER_EMAILS);
    });

    await t.test('allowlisted developer can enable developer access mode', async () => {
        const patch = await request(app)
            .patch('/api/access-mode')
            .set('Cookie', devCookie)
            .send({ mode: 'developer' });
        assert.equal(patch.status, 200);
        assert.equal(patch.body.plusTestMode, true);
        assert.ok(patch.body.models.includes('all'));
    });

    await t.test('regular user cannot enable developer access mode', async () => {
        const cookie = await registerAndCookie(`free-${Date.now()}@example.com`);
        const patch = await request(app)
            .patch('/api/access-mode')
            .set('Cookie', cookie)
            .send({ mode: 'developer' });
        assert.equal(patch.status, 403);
    });

    await t.test('diagnostics catalog hidden from non-allowlisted users', async () => {
        const cookie = await registerAndCookie(`nodiag-${Date.now()}@example.com`);
        const res = await request(app)
            .get('/api/developer/model-diagnostics')
            .set('Cookie', cookie);
        assert.equal(res.status, 404);
    });

    await t.test('diagnostics catalog available for allowlisted developer', async () => {
        const res = await request(app)
            .get('/api/developer/model-diagnostics')
            .set('Cookie', devCookie);
        assert.equal(res.status, 200);
        assert.ok(Array.isArray(res.body.models));
        assert.ok(res.body.models.length > 0);
        assert.ok(['not_tested', 'blocked'].includes(res.body.models[0].availabilityStatus));
    });

    await t.test('model test requires billable confirmation', async () => {
        const res = await request(app)
            .post('/api/developer/model-diagnostics/test')
            .set('Cookie', devCookie)
            .send({ slug: 'gpt', variantId: 'mini', confirmBillable: false });
        assert.equal(res.status, 400);
        assert.equal(res.body.code, 'CONFIRMATION_REQUIRED');
    });
});
