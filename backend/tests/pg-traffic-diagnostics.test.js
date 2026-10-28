const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    recordPgQuery,
    getPgTrafficSnapshot,
    resetPgTrafficStats,
} = require('../src/db/pgTrafficDiagnostics');

test('recordPgQuery tracks estimated payload sizes', () => {
    resetPgTrafficStats();
    recordPgQuery('SELECT id FROM users WHERE email = $1', ['a@example.com'], {
        rows: [{ id: 1, email: 'a@example.com' }],
    });
    const snap = getPgTrafficSnapshot();
    assert.equal(snap.queries, 1);
    assert.ok(snap.estimatedBytesOut > 0);
    assert.equal(snap.byOperation.select.queries, 1);
});
