const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    queryPgPool,
    isPgTimeoutError,
    buildQueryConfig,
    QUERY_GUARD_GRACE_MS,
} = require('../src/db/pgPoolQuery');

test('buildQueryConfig sets node-postgres query_timeout', () => {
    const config = buildQueryConfig('SELECT 1', [2], 1200);
    assert.equal(config.text, 'SELECT 1');
    assert.deepEqual(config.values, [2]);
    assert.equal(config.query_timeout, 1200);
});

test('queryPgPool passes query_timeout to pool.query', async () => {
    let seenTimeout;
    const pool = {
        query: (config) => {
            seenTimeout = config.query_timeout;
            return Promise.resolve({ rows: [{ ok: 1 }], rowCount: 1 });
        },
    };
    await queryPgPool(pool, 'SELECT 1', [], { timeoutMs: 900 });
    assert.equal(seenTimeout, 900);
});

test('queryPgPool rejects when pool enforces query read timeout and pool stays usable', async () => {
    let inFlight = 0;
    let waitingCount = 0;
    const pool = {
        get totalCount() {
            return 1;
        },
        get idleCount() {
            return inFlight ? 0 : 1;
        },
        get waitingCount() {
            return waitingCount;
        },
        query: (config) => new Promise((resolve, reject) => {
            inFlight += 1;
            const ms = Math.min(config.query_timeout || 30, 30);
            setTimeout(() => {
                inFlight -= 1;
                reject(new Error('Query read timeout'));
            }, ms);
        }),
    };

    for (let attempt = 0; attempt < 3; attempt += 1) {
        await assert.rejects(
            () => queryPgPool(pool, 'SELECT 1', [], { timeoutMs: 25 }),
            (error) => isPgTimeoutError(error),
        );
    }
    assert.equal(inFlight, 0);
    assert.equal(waitingCount, 0);

    const poolAfterRecovery = {
        query: (config) => {
            assert.equal(config.query_timeout, 25);
            return Promise.resolve({ rows: [{ id: 7 }], rowCount: 1 });
        },
    };
    const result = await queryPgPool(poolAfterRecovery, 'SELECT 1', [], { timeoutMs: 25 });
    assert.equal(result.rows[0].id, 7);
});

test('queryPgPool guard rejects hung query that ignores query_timeout', async () => {
    const pool = {
        query: () => new Promise(() => {}),
    };
    const started = Date.now();
    await assert.rejects(
        () => queryPgPool(pool, 'SELECT 1', [], { timeoutMs: 30 }),
        (error) => error.code === 'PG_QUERY_TIMEOUT',
    );
    assert.ok(Date.now() - started >= 30 + QUERY_GUARD_GRACE_MS - 5);
});

test('isPgTimeoutError recognizes timeout codes and pg read timeout message', () => {
    assert.equal(isPgTimeoutError({ code: 'PG_QUERY_TIMEOUT' }), true);
    assert.equal(isPgTimeoutError({ code: '57014' }), true);
    assert.equal(isPgTimeoutError({ message: 'Query read timeout' }), true);
    assert.equal(isPgTimeoutError({ code: '23505' }), false);
});
