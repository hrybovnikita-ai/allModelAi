const { queryPgPool, resolvePostgresAsyncPool } = require('./pgPoolQuery');

function isPostgresConnection(connection) {
    return (connection?.engine || 'sqlite') === 'postgres';
}

async function listChatHistoryRows(connection, normalizedEmail) {
    const pool = resolvePostgresAsyncPool(connection);
    const result = await queryPgPool(
        pool,
        `SELECT
            id,
            email,
            model,
            title,
            messages,
            created_at AS "createdAt",
            updated_at AS "updatedAt"
        FROM conversations
        WHERE lower(trim(email)) = $1
        ORDER BY updated_at DESC`,
        [normalizedEmail],
    );
    return result.rows;
}

async function listAnalyticsConversationRows(connection, email) {
    const pool = resolvePostgresAsyncPool(connection);
    const result = await queryPgPool(
        pool,
        `SELECT model, messages, created_at AS "createdAt"
         FROM conversations
         WHERE email = $1`,
        [email],
    );
    return result.rows;
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
