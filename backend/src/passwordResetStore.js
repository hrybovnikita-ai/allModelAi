const { isPostgresConnection } = require('./db/postgresHttpReads');
const { resolvePostgresAsyncPool, withPgTransaction, queryPgClient } = require('./db/pgPoolQuery');

// Consume the token, update the credential and revoke sessions atomically.
// Hashing happens before this function so database locks stay short-lived.
async function consumePasswordReset(connection, tokenHash, passwordHash) {
    if (isPostgresConnection(connection)) {
        return withPgTransaction(resolvePostgresAsyncPool(connection), async (client) => {
            const result = await queryPgClient(client,
                "DELETE FROM account_tokens WHERE token_hash = $1 AND purpose = 'password_reset' AND expires_at > $2 RETURNING email",
                [tokenHash, Date.now()]);
            const email = result.rows[0]?.email;
            if (!email) return false;
            const updated = await queryPgClient(client,
                'UPDATE users SET password_hash = $1, email_verified = 1 WHERE lower(trim(email)) = $2 RETURNING id',
                [passwordHash, email.trim().toLowerCase()]);
            if (!updated.rows[0]) throw new Error('Password reset account no longer exists');
            await queryPgClient(client, 'DELETE FROM auth_sessions WHERE user_id = $1', [updated.rows[0].id]);
            return true;
        });
    }
    const db = connection.database;
    return db.transaction(() => {
        const row = db.prepare("DELETE FROM account_tokens WHERE token_hash = ? AND purpose = 'password_reset' AND expires_at > ? RETURNING email")
            .get(tokenHash, Date.now());
        if (!row) return false;
        const result = db.prepare('UPDATE users SET password_hash = ?, email_verified = 1 WHERE lower(trim(email)) = ?')
            .run(passwordHash, row.email.trim().toLowerCase());
        if (!result.changes) throw new Error('Password reset account no longer exists');
        db.prepare('DELETE FROM auth_sessions WHERE user_id IN (SELECT id FROM users WHERE lower(trim(email)) = ?)')
            .run(row.email.trim().toLowerCase());
        return true;
    }).immediate();
}

module.exports = { consumePasswordReset };
