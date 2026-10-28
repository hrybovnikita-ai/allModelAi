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

function isMissingLifecycleColumnError(error) {
    const code = String(error?.code || '');
    const message = String(error?.message || '');
    return code === '42703'
        || /lifecycle_status|trashed_at/i.test(message)
        || /column .* does not exist/i.test(message);
}

function normalizeLifecycleScope(scope) {
    const normalized = String(scope || 'active').trim().toLowerCase();
    if (normalized === 'trash') return 'trashed';
    if (normalized === 'active' || normalized === 'archived' || normalized === 'trashed') return normalized;
    return 'active';
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

/**
 * Lightweight history list — omits the messages blob (can be tens of MB per user).
 */
const DEFAULT_HISTORY_LIST_LIMIT = Number(process.env.CHAT_HISTORY_LIST_LIMIT || 200);
const MAX_HISTORY_LIST_LIMIT = Number(process.env.CHAT_HISTORY_LIST_MAX || 500);

function clampHistoryLimit(limit) {
    const parsed = Number(limit);
    if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_HISTORY_LIST_LIMIT;
    return Math.min(Math.floor(parsed), MAX_HISTORY_LIST_LIMIT);
}

async function listChatHistorySummaryRows(connection, normalizedEmail, {
    temporaryOnly = false,
    lifecycleScope = 'active',
    limit = DEFAULT_HISTORY_LIST_LIMIT,
    offset = 0,
} = {}) {
    const rowLimit = clampHistoryLimit(limit);
    const rowOffset = Math.max(0, Math.floor(Number(offset) || 0));
    const pool = resolvePostgresAsyncPool(connection);
    const nowIso = new Date().toISOString();
    const scope = normalizeLifecycleScope(lifecycleScope);
    try {
        const result = temporaryOnly
            ? await queryPgPool(
                pool,
                `SELECT
                    id,
                    email,
                    model,
                    title,
                    created_at AS "createdAt",
                    updated_at AS "updatedAt",
                    COALESCE(is_temporary, FALSE) AS "isTemporary",
                    expires_at AS "expiresAt",
                    COALESCE(lifecycle_status, 'active') AS "lifecycleStatus",
                    jsonb_array_length(COALESCE(messages::jsonb, '[]'::jsonb)) AS "messageCount"
                FROM conversations
                WHERE lower(trim(email)) = $1
                  AND COALESCE(is_temporary, FALSE) = TRUE
                  AND expires_at IS NOT NULL
                  AND expires_at > $2::timestamptz
                ORDER BY updated_at DESC
                LIMIT $3 OFFSET $4`,
                [normalizedEmail, nowIso, rowLimit, rowOffset],
            )
            : await queryPgPool(
                pool,
                `SELECT
                    id,
                    email,
                    model,
                    title,
                    created_at AS "createdAt",
                    updated_at AS "updatedAt",
                    COALESCE(is_temporary, FALSE) AS "isTemporary",
                    expires_at AS "expiresAt",
                    COALESCE(lifecycle_status, 'active') AS "lifecycleStatus",
                    jsonb_array_length(COALESCE(messages::jsonb, '[]'::jsonb)) AS "messageCount"
                FROM conversations
                WHERE lower(trim(email)) = $1
                  AND COALESCE(is_temporary, FALSE) = FALSE
                  AND COALESCE(lifecycle_status, 'active') = $2
                ORDER BY updated_at DESC
                LIMIT $3 OFFSET $4`,
                [normalizedEmail, scope, rowLimit, rowOffset],
            );
        return result.rows;
    } catch (error) {
        if (!isMissingLifecycleColumnError(error) && !isMissingTemporaryColumnError(error)) throw error;
        if (temporaryOnly) return [];
        const fallback = await queryPgPool(
            pool,
            `SELECT
                id,
                email,
                model,
                title,
                created_at AS "createdAt",
                updated_at AS "updatedAt",
                FALSE AS "isTemporary",
                NULL AS "expiresAt",
                'active' AS "lifecycleStatus",
                jsonb_array_length(COALESCE(messages::jsonb, '[]'::jsonb)) AS "messageCount"
            FROM conversations
            WHERE lower(trim(email)) = $1
            ORDER BY updated_at DESC
            LIMIT $2 OFFSET $3`,
            [normalizedEmail, rowLimit, rowOffset],
        );
        return fallback.rows;
    }
}

async function computeUserAnalyticsAggregatesAsync(connection, email) {
    const pool = resolvePostgresAsyncPool(connection);
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const aggregateSql = `
        SELECT
            model,
            COUNT(*)::int AS conversations,
            COALESCE(SUM(jsonb_array_length(COALESCE(messages::jsonb, '[]'::jsonb))), 0)::int AS messages,
            COALESCE(SUM(
                (
                    SELECT COALESCE(SUM(char_length(COALESCE(elem->>'content', elem->>'text', ''))), 0)
                    FROM jsonb_array_elements(COALESCE(messages::jsonb, '[]'::jsonb)) AS elem
                )
            ), 0)::int AS characters
        FROM conversations
        WHERE lower(trim(email)) = $1
          AND COALESCE(is_temporary, FALSE) = FALSE
        GROUP BY model
    `;
    try {
        const result = await queryPgPool(pool, aggregateSql, [normalizedEmail]);
        return result.rows;
    } catch (error) {
        if (!isMissingTemporaryColumnError(error)) throw error;
        const fallback = await queryPgPool(
            pool,
            `
            SELECT
                model,
                COUNT(*)::int AS conversations,
                COALESCE(SUM(jsonb_array_length(COALESCE(messages::jsonb, '[]'::jsonb))), 0)::int AS messages,
                COALESCE(SUM(
                    (
                        SELECT COALESCE(SUM(char_length(COALESCE(elem->>'content', elem->>'text', ''))), 0)
                        FROM jsonb_array_elements(COALESCE(messages::jsonb, '[]'::jsonb)) AS elem
                    )
                ), 0)::int AS characters
            FROM conversations
            WHERE lower(trim(email)) = $1
            GROUP BY model
            `,
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
    clampHistoryLimit,
    DEFAULT_HISTORY_LIST_LIMIT,
    MAX_HISTORY_LIST_LIMIT,
    computeUserAnalyticsAggregatesAsync,
    listAnalyticsConversationRows,
    listChatHistoryRows,
    listChatHistorySummaryRows,
    normalizeLifecycleScope,
    listWorkspaceItemRows,
    lookupDeveloperApiKeyAsync,
    touchDeveloperApiKeyAsync,
};
