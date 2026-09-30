const { queryPgPool, resolvePostgresAsyncPool, withPgTransaction, queryPgClient } = require('./pgPoolQuery');

async function findUserByNormalizedEmailAsync(connection, normalizedEmail) {
    const pool = resolvePostgresAsyncPool(connection);
    const result = await queryPgPool(
        pool,
        `SELECT id, password_hash AS "passwordHash"
         FROM users WHERE lower(trim(email)) = $1`,
        [normalizedEmail],
    );
    return result.rows[0] || null;
}

async function registerUserPostgresAsync(connection, { safeName, normalizedEmail, passwordHash }) {
    const pool = resolvePostgresAsyncPool(connection);
    return withPgTransaction(pool, async (client) => {
        const existing = await queryPgClient(
            client,
            `SELECT id, password_hash AS "passwordHash" FROM users WHERE lower(trim(email)) = $1`,
            [normalizedEmail],
        );
        const row = existing.rows[0];
        if (row) {
            return { conflict: true, existing: row };
        }
        const inserted = await queryPgClient(
            client,
            `INSERT INTO users (name, email, password_hash, email_verified)
             VALUES ($1, $2, $3, 1)
             RETURNING id`,
            [safeName, normalizedEmail, passwordHash],
        );
        const id = inserted.rows[0].id;
        return { id, name: safeName, email: normalizedEmail, passwordHash };
    });
}

async function userHasSocialIdentityAsync(connection, userId) {
    const pool = resolvePostgresAsyncPool(connection);
    const result = await queryPgPool(
        pool,
        'SELECT 1 AS ok FROM social_identities WHERE user_id = $1 LIMIT 1',
        [userId],
    );
    return Boolean(result.rows[0]);
}

async function getPasswordHashByUserIdAsync(connection, userId) {
    const pool = resolvePostgresAsyncPool(connection);
    const result = await queryPgPool(
        pool,
        'SELECT password_hash FROM users WHERE id = $1',
        [userId],
    );
    return result.rows[0]?.password_hash ?? null;
}

async function findOrCreateQuickSocialUserAsync(connection, { safeName, normalizedEmail, avatar }) {
    const pool = resolvePostgresAsyncPool(connection);
    const found = await queryPgPool(
        pool,
        'SELECT id, name, email, avatar_url AS avatar FROM users WHERE lower(email) = $1',
        [normalizedEmail],
    );
    if (found.rows[0]) {
        const user = found.rows[0];
        if (avatar && !user.avatar) {
            await queryPgPool(
                pool,
                'UPDATE users SET avatar_url = $1 WHERE id = $2',
                [avatar, user.id],
            );
            user.avatar = avatar;
        }
        return user;
    }
    const inserted = await queryPgPool(
        pool,
        `INSERT INTO users (name, email, avatar_url, email_verified)
         VALUES ($1, $2, $3, 1)
         RETURNING id, name, email, avatar_url AS avatar`,
        [safeName, normalizedEmail, avatar || null],
    );
    return inserted.rows[0];
}

async function deleteAccountPostgresAsync(connection, { userId, email }) {
    const pool = resolvePostgresAsyncPool(connection);
    const normalizedEmail = String(email).trim().toLowerCase();
    await queryPgPool(pool, 'DELETE FROM auth_sessions WHERE user_id = $1', [userId]);
    await queryPgPool(pool, 'DELETE FROM account_access_modes WHERE email = $1', [normalizedEmail]);
    await queryPgPool(pool, 'DELETE FROM conversations WHERE email = $1', [normalizedEmail]);
    await queryPgPool(pool, 'DELETE FROM workspace_items WHERE email = $1', [normalizedEmail]);
    await queryPgPool(pool, 'DELETE FROM usage WHERE email = $1', [normalizedEmail]);
    await queryPgPool(pool, 'DELETE FROM subscriptions WHERE email = $1', [normalizedEmail]);
    await queryPgPool(pool, 'DELETE FROM subscription_details WHERE email = $1', [normalizedEmail]);
    await queryPgPool(pool, 'DELETE FROM users WHERE id = $1', [userId]);
}

module.exports = {
    findUserByNormalizedEmailAsync,
    registerUserPostgresAsync,
    userHasSocialIdentityAsync,
    getPasswordHashByUserIdAsync,
    findOrCreateQuickSocialUserAsync,
    deleteAccountPostgresAsync,
};
