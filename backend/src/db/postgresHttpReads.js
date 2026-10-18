const { queryPgPool, resolvePostgresAsyncPool } = require('./pgPoolQuery');

function isPostgresConnection(connection) {
    return (connection?.engine || 'sqlite') === 'postgres';
}

function isMissingTemporaryColumnError(error) {
    const code = String(error?.code || '');
    const message = String(error?.message || '');
    return code === '42703'
        || /is_temporary|expires_at/i.test(message)
        || /column .* does not exist/i.test(message);
}

async function listChatHistoryRows(connection, normalizedEmail, { temporaryOnly = false } = {}) {
    const pool = resolvePostgresAsyncPool(connection);
    const nowIso = new Date().toISOString();
    // Regular history never includes temporary chats.
    // Temporary list returns only unexpired temporary conversations.
    try {
        const result = temporaryOnly
            ? await queryPgPool(
                pool,
                `SELECT
                    id,
                    email,
                    model,
                    title,
                    messages,
                    created_at AS "createdAt",
                    updated_at AS "updatedAt",
                    COALESCE(is_temporary, FALSE) AS "isTemporary",
                    expires_at AS "expiresAt"
                FROM conversations
                WHERE lower(trim(email)) = $1
                  AND COALESCE(is_temporary, FALSE) = TRUE
                  AND expires_at IS NOT NULL
                  AND expires_at > $2::timestamptz
                ORDER BY updated_at DESC`,
                [normalizedEmail, nowIso],
            )
            : await queryPgPool(
                pool,
                `SELECT
                    id,
                    email,
                    model,
                    title,
                    messages,
                    created_at AS "createdAt",
                    updated_at AS "updatedAt",
                    COALESCE(is_temporary, FALSE) AS "isTemporary",
                    expires_at AS "expiresAt"
                FROM conversations
                WHERE lower(trim(email)) = $1
                  AND COALESCE(is_temporary, FALSE) = FALSE
                ORDER BY updated_at DESC`,
                [normalizedEmail],
            );
        return result.rows;
    } catch (error) {
        if (!isMissingTemporaryColumnError(error)) throw error;
        // Production DBs that missed migration 015 still need history/analytics to work.
        if (temporaryOnly) return [];
        const fallback = await queryPgPool(
            pool,
            `SELECT
                id,
                email,
                model,
                title,
                messages,
                created_at AS "createdAt",
                updated_at AS "updatedAt",
                FALSE AS "isTemporary",
                NULL AS "expiresAt"
            FROM conversations
            WHERE lower(trim(email)) = $1
            ORDER BY updated_at DESC`,
            [normalizedEmail],
        );
        return fallback.rows;
    }
}

async function listAnalyticsConversationRows(connection, email) {
    const pool = resolvePostgresAsyncPool(connection);
    const normalizedEmail = String(email || '').trim().toLowerCase();
    // Exclude temporary chat content from analytics aggregates.
    try {
        const result = await queryPgPool(
            pool,
            `SELECT model, messages, created_at AS "createdAt"
             FROM conversations
             WHERE lower(trim(email)) = $1
               AND COALESCE(is_temporary, FALSE) = FALSE`,
            [normalizedEmail],
        );
        return result.rows;
    } catch (error) {
        if (!isMissingTemporaryColumnError(error)) throw error;
        const fallback = await queryPgPool(
            pool,
            `SELECT model, messages, created_at AS "createdAt"
             FROM conversations
             WHERE lower(trim(email)) = $1`,
            [normalizedEmail],
        );
        return fallback.rows;
    }
}

async function lookupDeveloperApiKeyAsync(connection, keyHash, nowIso) {
    const pool = resolvePostgresAsyncPool(connection);
    const result = await queryPgPool(
        pool,
        `SELECT developer_api_keys.*,
                users.id AS user_id,
                users.name AS user_name
         FROM developer_api_keys
         JOIN users ON lower(users.email) = lower(developer_api_keys.email)
         WHERE key_hash = $1
           AND (expires_at IS NULL OR expires_at > $2)`,
        [keyHash, nowIso],
    );
    return result.rows[0] || null;
}

async function touchDeveloperApiKeyAsync(connection, keyId, nowIso) {
    const pool = resolvePostgresAsyncPool(connection);
    await queryPgPool(
        pool,
        `UPDATE developer_api_keys
         SET last_used_at = $1, used_count = used_count + 1
         WHERE id = $2`,
        [nowIso, keyId],
    );
}

async function listWorkspaceItemRows(connection, email, type) {
    const pool = resolvePostgresAsyncPool(connection);
    const result = await queryPgPool(
        pool,
        `SELECT id, email, type, data, created_at, updated_at
         FROM workspace_items
         WHERE email = $1 AND type = $2
         ORDER BY updated_at DESC`,
        [email, type],
    );
    return result.rows;
}

module.exports = {
    isPostgresConnection,
    listAnalyticsConversationRows,
    listChatHistoryRows,
    listWorkspaceItemRows,
    lookupDeveloperApiKeyAsync,
    touchDeveloperApiKeyAsync,
};
