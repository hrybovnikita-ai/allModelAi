const { queryPgPool, resolvePostgresAsyncPool } = require('./pgPoolQuery');

async function listDeveloperApiKeysAsync(connection, email) {
    const pool = resolvePostgresAsyncPool(connection);
    const result = await queryPgPool(
        pool,
        `SELECT id, name, prefix, created_at AS "createdAt", last_used_at AS "lastUsedAt",
                expires_at AS "expiresAt", request_limit AS "requestLimit", used_count AS "usedCount"
         FROM developer_api_keys WHERE email = $1 ORDER BY created_at DESC`,
        [email],
    );
    return result.rows;
}

async function insertDeveloperApiKeyAsync(connection, row) {
    const pool = resolvePostgresAsyncPool(connection);
    await queryPgPool(
        pool,
        `INSERT INTO developer_api_keys (
            id, email, name, key_hash, prefix, created_at, expires_at, request_limit
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
            row.id,
            row.email,
            row.name,
            row.keyHash,
            row.prefix,
            row.createdAt,
            row.expiresAt,
            row.requestLimit,
        ],
    );
}

async function deleteDeveloperApiKeyAsync(connection, id, email) {
    const pool = resolvePostgresAsyncPool(connection);
    const result = await queryPgPool(
        pool,
        'DELETE FROM developer_api_keys WHERE id = $1 AND email = $2',
        [id, email],
    );
    return result.rowCount ?? 0;
}

async function insertArenaVoteAsync(connection, row) {
    const pool = resolvePostgresAsyncPool(connection);
    await queryPgPool(
        pool,
        `INSERT INTO arena_votes (user_email, model_a, model_b, winner, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [row.userEmail, row.modelA, row.modelB, row.winner, row.createdAt],
    );
}

async function listArenaVotesAsync(connection) {
    const pool = resolvePostgresAsyncPool(connection);
    const result = await queryPgPool(
        pool,
        'SELECT model_a, model_b, winner FROM arena_votes',
    );
    return result.rows;
}

async function getSharedConversationByTokenAsync(connection, token) {
    const pool = resolvePostgresAsyncPool(connection);
    const result = await queryPgPool(
        pool,
        `SELECT conversations.title, conversations.model, conversations.messages,
                shared_conversations.created_at AS "sharedAt"
         FROM shared_conversations
         JOIN conversations ON conversations.id = shared_conversations.conversation_id
         WHERE shared_conversations.token = $1`,
        [token],
    );
    return result.rows[0] || null;
}

async function getConversationIdForOwnerAsync(connection, conversationId, ownerEmail) {
    const pool = resolvePostgresAsyncPool(connection);
    const result = await queryPgPool(
        pool,
        'SELECT id FROM conversations WHERE id = $1 AND email = $2',
        [conversationId, ownerEmail],
    );
    return result.rows[0] || null;
}

async function getOrCreateShareTokenAsync(connection, conversationId, ownerEmail, token, createdAt) {
    const pool = resolvePostgresAsyncPool(connection);
    const existing = await queryPgPool(
        pool,
        `SELECT token FROM shared_conversations
         WHERE conversation_id = $1 AND owner_email = $2`,
        [conversationId, ownerEmail],
    );
    if (existing.rows[0]?.token) {
        return existing.rows[0].token;
    }
    await queryPgPool(
        pool,
        `INSERT INTO shared_conversations (token, conversation_id, owner_email, created_at)
         VALUES ($1, $2, $3, $4)`,
        [token, conversationId, ownerEmail, createdAt],
    );
    return token;
}

module.exports = {
    listDeveloperApiKeysAsync,
    insertDeveloperApiKeyAsync,
    deleteDeveloperApiKeyAsync,
    insertArenaVoteAsync,
    listArenaVotesAsync,
    getSharedConversationByTokenAsync,
    getConversationIdForOwnerAsync,
    getOrCreateShareTokenAsync,
};
