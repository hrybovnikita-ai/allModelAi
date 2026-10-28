const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    getCachedUserResponse,
    setCachedUserResponse,
    dedupeInFlight,
    invalidateUserCache,
    resetForTests,
} = require('../src/services/smartApiCache');

test('user-scoped cache isolates tenants', () => {
    resetForTests();
    setCachedUserResponse('a@example.com', '/api/analytics', { ok: true });
    setCachedUserResponse('b@example.com', '/api/analytics', { ok: false });
    assert.deepEqual(getCachedUserResponse('a@example.com', '/api/analytics'), { ok: true });
    assert.deepEqual(getCachedUserResponse('b@example.com', '/api/analytics'), { ok: false });
    invalidateUserCache('a@example.com');
    assert.equal(getCachedUserResponse('a@example.com', '/api/analytics'), null);
    assert.deepEqual(getCachedUserResponse('b@example.com', '/api/analytics'), { ok: false });
});

test('dedupeInFlight coalesces parallel calls', async () => {
    resetForTests();
    let runs = 0;
    const factory = async () => {
        runs += 1;
        await new Promise((r) => setTimeout(r, 20));
        return 'done';
    };
    const [a, b] = await Promise.all([
        dedupeInFlight('key-1', factory),
        dedupeInFlight('key-1', factory),
    ]);
    assert.equal(a, 'done');
    assert.equal(b, 'done');
    assert.equal(runs, 1);
});
