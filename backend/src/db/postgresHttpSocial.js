const { queryPgPool, resolvePostgresAsyncPool, withPgTransaction, queryPgClient } = require('./pgPoolQuery');

async function getSessionOwnerUserIdAsync(connection, tokenHash, nowMs) {
    const pool = resolvePostgresAsyncPool(connection);
    const result = await queryPgPool(
        pool,
        `SELECT user_id FROM auth_sessions WHERE token_hash = $1 AND expires_at > $2`,
        [tokenHash, nowMs],
    );
    return result.rows[0]?.user_id ?? null;
}

async function purgeExpiredSocialChallengesAsync(connection, nowMs) {
    const pool = resolvePostgresAsyncPool(connection);
    await queryPgPool(
        pool,
        'DELETE FROM social_auth_challenges WHERE expires_at < $1',
        [nowMs],
    );
}

async function insertSocialChallengeAsync(connection, row) {
    const pool = resolvePostgresAsyncPool(connection);
    await queryPgPool(
        pool,
        `INSERT INTO social_auth_challenges (state_hash, intent, session_hash, user_id, expires_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [row.stateHash, row.intent, row.sessionHash, row.userId, row.expiresAt],
    );
}

async function getSocialChallengeAsync(connection, stateHash, nowMs) {
    const pool = resolvePostgresAsyncPool(connection);
    const result = await queryPgPool(
        pool,
        'SELECT * FROM social_auth_challenges WHERE state_hash = $1 AND expires_at > $2',
        [stateHash, nowMs],
    );
    return result.rows[0] || null;
}

async function getUserAccountByIdAsync(connection, id) {
    const pool = resolvePostgresAsyncPool(connection);
    const result = await queryPgPool(
        pool,
        'SELECT id, name, email, avatar_url AS avatar FROM users WHERE id = $1',
        [id],
    );
    return result.rows[0] || null;
}

async function exchangeSocialAuthAsync(connection, {
    stateHash,
    nowMs,
    profile,
    pending,
    canonicalEmail,
}) {
    const pool = resolvePostgresAsyncPool(connection);
    return withPgTransaction(pool, async (client) => {
        const deleted = await queryPgClient(
            client,
            'DELETE FROM social_auth_challenges WHERE state_hash = $1 AND expires_at > $2',
            [stateHash, nowMs],
        );
        if (!deleted.rowCount) {
            return { error: { status: 403, code: 'INVALID_STATE', message: 'Sign-in was already completed or expired.' } };
        }

        const linked = await queryPgClient(
            client,
            'SELECT user_id FROM social_identities WHERE provider = $1 AND subject = $2',
            [profile.provider, profile.subject],
        );
        let userId = linked.rows[0]?.user_id;

        if (pending.intent === 'link') {
            if (userId && userId !== pending.user_id) {
                return { error: { status: 409, code: 'IDENTITY_CONFLICT', message: 'This provider identity is already connected to another account.' } };
            }
            userId = pending.user_id;
            const other = await queryPgClient(
                client,
                'SELECT subject FROM social_identities WHERE user_id = $1 AND provider = $2',
                [userId, profile.provider],
            );
            if (other.rows[0] && other.rows[0].subject !== profile.subject) {
                return { error: { status: 409, code: 'IDENTITY_CONFLICT', message: 'A different identity from this provider is already connected.' } };
            }
        } else if (!userId) {
            const existing = await queryPgClient(
                client,
                'SELECT id, name FROM users WHERE lower(email) = $1',
                [canonicalEmail],
            );
            if (existing.rows[0]) {
                userId = existing.rows[0].id;
                if (profile.name && (!existing.rows[0].name || existing.rows[0].name === profile.email.split('@')[0])) {
                    await queryPgClient(
                        client,
                        'UPDATE users SET name = $1 WHERE id = $2',
                        [profile.name, userId],
                    );
                }
            } else {
                const inserted = await queryPgClient(
                    client,
                    `INSERT INTO users (name, email, avatar_url, email_verified)
                     VALUES ($1, $2, $3, 1)
                     RETURNING id`,
                    [profile.name, canonicalEmail, profile.avatar],
                );
                userId = inserted.rows[0].id;
            }
        }

        await queryPgClient(
            client,
            `INSERT INTO social_identities (provider, subject, user_id)
             VALUES ($1, $2, $3)
             ON CONFLICT (provider, subject) DO NOTHING`,
            [profile.provider, profile.subject, userId],
        );
        if (profile.avatar) {
            await queryPgClient(
                client,
                'UPDATE users SET avatar_url = COALESCE(avatar_url, $1) WHERE id = $2',
                [profile.avatar, userId],
            );
        }
        await queryPgClient(
            client,
            'UPDATE users SET email_verified = 1 WHERE id = $1 AND email_verified <> 1',
            [userId],
        );

        const userResult = await queryPgClient(
            client,
            'SELECT id, name, email, avatar_url AS avatar FROM users WHERE id = $1',
            [userId],
        );
        return {
            user: userResult.rows[0],
            createSession: pending.intent === 'login',
        };
    });
}

async function listSocialProvidersForUserAsync(connection, userId) {
    const pool = resolvePostgresAsyncPool(connection);
    const result = await queryPgPool(
        pool,
        'SELECT provider FROM social_identities WHERE user_id = $1',
        [userId],
    );
    return result.rows.map((row) => row.provider);
}

async function getStoredUserForCacheAsync(connection, userId) {
    const pool = resolvePostgresAsyncPool(connection);
    const result = await queryPgPool(
        pool,
        'SELECT id, name, email, password_hash AS "passwordHash" FROM users WHERE id = $1',
        [userId],
    );
    return result.rows[0] || null;
}

module.exports = {
    getSessionOwnerUserIdAsync,
    purgeExpiredSocialChallengesAsync,
    insertSocialChallengeAsync,
    getSocialChallengeAsync,
    getUserAccountByIdAsync,
    exchangeSocialAuthAsync,
    listSocialProvidersForUserAsync,
    getStoredUserForCacheAsync,
};
