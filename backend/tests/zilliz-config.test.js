const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const ORIGINAL = { ...process.env };

before(() => {
    delete process.env.ZILLIZ_URI;
    delete process.env.ZILLIZ_TOKEN;
    delete process.env.ZILLIZ_API_USER;
    delete process.env.ZILLIZ_API_PASSWORD;
    delete process.env.ZILLIZ_COLLECTION;
    delete process.env.ZILLIZ_ENABLED;
});

after(() => {
    for (const key of Object.keys(process.env)) {
        if (!(key in ORIGINAL)) delete process.env[key];
    }
    Object.assign(process.env, ORIGINAL);
});

test('getZillizConfigReport never includes password or token values', () => {
    process.env.ZILLIZ_URI = 'https://example.zillizcloud.com:19530';
    process.env.ZILLIZ_API_USER = 'db_admin';
    process.env.ZILLIZ_API_PASSWORD = 'super-secret-password';
    process.env.ZILLIZ_COLLECTION = 'allmodelai_user_memory';

    const { getZillizConfigReport } = require('../src/services/zilliz/zillizConfig');
    const report = getZillizConfigReport();
    const json = JSON.stringify(report);
    assert.equal(report.configured, true);
    assert.equal(report.tokenSource, 'ZILLIZ_API_USER:ZILLIZ_API_PASSWORD');
    assert.doesNotMatch(json, /super-secret-password/);
    assert.doesNotMatch(json, /db_admin:super/);
});

test('explicit ZILLIZ_TOKEN takes precedence over username/password', () => {
    process.env.ZILLIZ_URI = 'https://example.zillizcloud.com:19530';
    process.env.ZILLIZ_TOKEN = 'api-key-example';
    process.env.ZILLIZ_API_USER = 'db_admin';
    process.env.ZILLIZ_API_PASSWORD = 'unused-secret';

    // Fresh require path via cache bust of resolve helpers — call resolve directly
    delete require.cache[require.resolve('../src/services/zilliz/zillizConfig')];
    const { resolveZillizToken, getZillizConfigReport } = require('../src/services/zilliz/zillizConfig');
    const resolved = resolveZillizToken();
    assert.equal(resolved.source, 'ZILLIZ_TOKEN');
    const report = getZillizConfigReport();
    assert.equal(report.authMode, 'token');
    assert.doesNotMatch(JSON.stringify(report), /api-key-example/);
    assert.doesNotMatch(JSON.stringify(report), /unused-secret/);
});
