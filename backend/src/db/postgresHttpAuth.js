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

async function registerUserPostgresAsync(connection, { safeName, normalizedEmail, passwordHash, emailVerified = true }) {
    const pool = resolvePostgresAsyncPool(connection);
    const verifiedFlag = emailVerified ? 1 : 0;
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
        let inserted;
        try {
            inserted = await queryPgClient(
                client,
                `INSERT INTO users (name, email, password_hash, email_verified)
                 VALUES ($1, $2, $3, $4)
                 RETURNING id`,
                [safeName, normalizedEmail, passwordHash, verifiedFlag],
            );
        } catch (error) {
            if (error.code !== '23505') throw error;
            const raced = await queryPgClient(
                client,
                `SELECT id, password_hash AS "passwordHash" FROM users WHERE lower(trim(email)) = $1`,
                [normalizedEmail],
            );
            return { conflict: true, existing: raced.rows[0] || { id: null, passwordHash: null } };
        }
        const id = inserted.rows[0].id;
        return { id, name: safeName, email: normalizedEmail, passwordHash, emailVerified: Boolean(emailVerified) };
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
    const { extractPasswordHash } = require('../authPasswordHash');
    const pool = resolvePostgresAsyncPool(connection);
    const result = await queryPgPool(
        pool,
        'SELECT password_hash FROM users WHERE id = $1',
        [userId],
    );
    return extractPasswordHash(result.rows[0]);
}

async function findOrCreateQuickSocialUserAsync(connection, { safeName, normalizedEmail, avatar }) {
    const pool = resolvePostgresAsyncPool(connection);
    const found = await queryPgPool(
        pool,
        'SELECT id, name, email, avatar_url AS avatar FROM users WHERE lower(trim(email)) = $1',
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
