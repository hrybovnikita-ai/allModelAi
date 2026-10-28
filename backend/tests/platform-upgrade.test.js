const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const { prepareExport, assertSafePath } = require('../src/platform/projectExport');
const { verifyHmacSha256, rememberEvent, clearEventsForTests, assertFreshTimestamp } = require('../src/platform/webhookEvents');
const { listCredentials } = require('../src/platform/credentialVault');
const { runMockedQualityLab, API_CONTRACTS } = require('../src/platform/qualityContracts');

test('project export rejects secrets and path traversal', () => {
    assert.throws(() => assertSafePath('../.env'), /not allowed/);
    assert.throws(() => prepareExport([{ path: '.env', content: 'SECRET=1' }]), /cannot be exported/);
    const packed = prepareExport([{ path: 'src/app.js', content: 'console.log(1)\n' }], { name: 'Demo' });
    assert.equal(packed.zip.readUInt32LE(0), 0x04034b50);
    assert.equal(packed.sha256, crypto.createHash('sha256').update(packed.zip).digest('hex'));
});

test('webhook signatures reject replays and bad signatures', () => {
    clearEventsForTests();
    const payload = JSON.stringify({ type: 'subscription.renewed' });
    const good = crypto.createHmac('sha256', 'test-secret').update(payload).digest('hex');
    assert.equal(verifyHmacSha256({ secret: 'test-secret', payload, signature: good }), true);
    assert.equal(verifyHmacSha256({ secret: 'test-secret', payload, signature: '00' }), false);
    assert.equal(assertFreshTimestamp(Date.now()), true);
    assert.equal(assertFreshTimestamp(Date.now() - 60 * 60 * 1000), false);
    assert.equal(rememberEvent('evt-1').duplicate, false);
    assert.equal(rememberEvent('evt-1').duplicate, true);
});

test('credential vault masks values and quality lab stays mocked', () => {
    const previous = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = 'gemini-test-key-value';
    try {
        const gemini = listCredentials().find((row) => row.provider === 'gemini');
        assert.equal(gemini.configured, true);
        assert.equal(JSON.stringify(gemini).includes('gemini-test-key-value'), false);
        const report = runMockedQualityLab();
        assert.equal(report.failed, 0);
        assert.equal(report.mode, 'mocked');
        assert.ok(API_CONTRACTS.some((item) => item.path === '/api/chat'));
    } finally {
        if (previous == null) delete process.env.GEMINI_API_KEY;
        else process.env.GEMINI_API_KEY = previous;
    }
});
