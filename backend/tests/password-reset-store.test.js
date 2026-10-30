const { test } = require('node:test');
const assert = require('node:assert/strict');
const { consumePasswordReset } = require('../src/passwordResetStore');

function postgresFixture({ missing = false, failRevoke = false } = {}) {
    const statements = [];
    const client = {
        async query(query) {
            const text = typeof query === 'string' ? query : query.text;
            statements.push(text);
            if (text.startsWith('DELETE FROM account_tokens')) {
                assert.match(text, /purpose = 'password_reset' AND expires_at > \$2 RETURNING email/);
                return { rows: missing ? [] : [{ email: 'owner@example.com' }] };
            }
            if (text.startsWith('UPDATE users')) return { rows: [{ id: 42 }], rowCount: 1 };
            if (text.startsWith('DELETE FROM auth_sessions') && failRevoke) throw new Error('database unavailable');
            return { rows: [], rowCount: 0 };
        },
        release() { statements.push('RELEASE'); },
    };
    return { connection: { engine: 'postgres', pgAsyncPool: { connect: async () => client } }, statements };
}

test('PostgreSQL reset consumes a live token and revokes sessions within one transaction', async () => {
    const { connection, statements } = postgresFixture();
    assert.equal(await consumePasswordReset(connection, 'hashed-token', 'hashed-password'), true);
    assert.equal(statements[0], 'BEGIN');
    assert.match(statements[1], /^DELETE FROM account_tokens/);
    assert.match(statements[2], /^UPDATE users/);
    assert.match(statements[3], /^DELETE FROM auth_sessions/);
    assert.deepEqual(statements.slice(-2), ['COMMIT', 'RELEASE']);
});

test('PostgreSQL reset does not change credentials when another request consumed the token', async () => {
    const { connection, statements } = postgresFixture({ missing: true });
    assert.equal(await consumePasswordReset(connection, 'used-token', 'hashed-password'), false);
    assert.ok(!statements.some(text => text.startsWith('UPDATE')));
});

test('session revocation failure rolls back the password change and token consumption', async () => {
    const { connection, statements } = postgresFixture({ failRevoke: true });
    await assert.rejects(consumePasswordReset(connection, 'hashed-token', 'hashed-password'), /database unavailable/);
    assert.deepEqual(statements.slice(-2), ['ROLLBACK', 'RELEASE']);
    assert.ok(!statements.includes('COMMIT'));
});
