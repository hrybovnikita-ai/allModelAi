const { queryPgPool, resolvePostgresAsyncPool } = require('./pgPoolQuery');

async function bumpUsageCountAsync(connection, normalizedEmail) {
    const pool = resolvePostgresAsyncPool(connection);
    await queryPgPool(
        pool,
        `INSERT INTO usage (email, used) VALUES ($1, 1)
         ON CONFLICT (email) DO UPDATE SET used = usage.used + 1`,
        [normalizedEmail],
    );
}

async function insertUsageEventAsync(connection, row) {
    const pool = resolvePostgresAsyncPool(connection);
    await queryPgPool(
        pool,
        `INSERT INTO usage_events (
            email, model, input_tokens, output_tokens, latency_ms,
            fallback_used, estimated_cost, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
            row.email,
            row.model,
            row.inputTokens,
            row.outputTokens,
            row.latencyMs,
            row.fallbackUsed ? 1 : 0,
            row.estimatedCost,
            row.createdAt,
        ],
    );
}

async function listMemoryWorkspaceDataAsync(connection, normalizedEmail) {
    const pool = resolvePostgresAsyncPool(connection);
    const result = await queryPgPool(
        pool,
        `SELECT data FROM workspace_items
         WHERE email = $1 AND type = 'memory'
         ORDER BY updated_at DESC
         LIMIT 20`,
        [normalizedEmail],
    );
    return result.rows;
}

async function listDocumentWorkspaceItemsAsync(connection, email) {
    const pool = resolvePostgresAsyncPool(connection);
    const result = await queryPgPool(
        pool,
        `SELECT id, email, type, data, created_at, updated_at
         FROM workspace_items
         WHERE email = $1 AND type = 'document'
         ORDER BY updated_at DESC`,
        [email],
    );
    return result.rows;
}

async function getConversationRowAsync(connection, id, email) {
    const pool = resolvePostgresAsyncPool(connection);
    const result = await queryPgPool(
        pool,
        `SELECT id, email, model, title, messages,
                created_at AS "createdAt",
                updated_at AS "updatedAt",
                COALESCE(is_temporary, FALSE) AS "isTemporary",
                expires_at AS "expiresAt"
         FROM conversations WHERE id = $1 AND email = $2`,
        [id, email],
    );
    return result.rows[0] || null;
}

async function insertConversationRowAsync(connection, conversation) {
    const pool = resolvePostgresAsyncPool(connection);
    await queryPgPool(
        pool,
        `INSERT INTO conversations (
            id, email, model, title, messages, created_at, updated_at, is_temporary, expires_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
            conversation.id,
            conversation.email,
            conversation.model,
            conversation.title,
            JSON.stringify(conversation.messages || []),
            conversation.createdAt,
            conversation.updatedAt,
            Boolean(conversation.isTemporary || conversation.is_temporary || conversation.temporary),
            conversation.expiresAt || conversation.expires_at || null,
        ],
    );
}

async function updateConversationRowAsync(connection, id, email, patch) {
    const pool = resolvePostgresAsyncPool(connection);
    const fields = [];
    const values = [];
    let index = 1;
    if (patch.title != null) {
        fields.push(`title = $${index}`);
        values.push(patch.title);
        index += 1;
    }
    if (patch.messages != null) {
        fields.push(`messages = $${index}`);
        values.push(JSON.stringify(patch.messages));
        index += 1;
    }
    if (patch.model != null) {
        fields.push(`model = $${index}`);
        values.push(patch.model);
        index += 1;
    }
    if (patch.updatedAt != null) {
        fields.push(`updated_at = $${index}`);
        values.push(patch.updatedAt);
        index += 1;
    }
    if (patch.lifecycleStatus != null) {
        fields.push(`lifecycle_status = $${index}`);
        values.push(patch.lifecycleStatus);
        index += 1;
    }
    if (patch.trashedAt !== undefined) {
        fields.push(`trashed_at = $${index}`);
        values.push(patch.trashedAt);
        index += 1;
    }
    // Intentionally never patch expires_at / is_temporary — TTL is fixed at creation.
    if (!fields.length) return 0;
    values.push(id, email);
    const result = await queryPgPool(
        pool,
        `UPDATE conversations SET ${fields.join(', ')} WHERE id = $${index} AND lower(trim(email)) = lower(trim($${index + 1}))`,
        values,
    );
    return result.rowCount ?? 0;
}

async function deleteConversationRowAsync(connection, id, email) {
    const pool = resolvePostgresAsyncPool(connection);
    const result = await queryPgPool(
        pool,
        'DELETE FROM conversations WHERE id = $1 AND email = $2',
        [id, email],
    );
    return result.rowCount ?? 0;
}

async function persistChatTurnAsync(connection, {
    userEmail,
    conversationId,
    temporary,
    model,
    savedMessages,
    title,
    bumpUsage,
}) {
    const {
        computeExpiresAt,
        assertTemporaryAccessible,
        nowIso,
    } = require('../services/temporaryChat');
    const normalizedEmail = String(userEmail).trim().toLowerCase();
    const now = nowIso();
    const { mergePersistedMessages } = require('../services/chatMessageMerge');
    const { normalizeMessages } = require('../services/chatMessageNormalize');
    let messagesToSave = savedMessages;
    if (bumpUsage) {
        await bumpUsageCountAsync(connection, normalizedEmail);
    }
    if (conversationId) {
        const existingRow = await getConversationRowAsync(connection, conversationId, normalizedEmail);
        if (existingRow) {
            const access = assertTemporaryAccessible(existingRow);
            if (!access.ok) {
                // Do not revive or extend expired temporary chats.
                return { skipped: true, code: access.code };
            }
            if (existingRow?.messages) {
                try {
                    const existingMessages = JSON.parse(existingRow.messages || '[]');
                    messagesToSave = normalizeMessages(
                        mergePersistedMessages(existingMessages, savedMessages),
                    );
                } catch {
                    messagesToSave = normalizeMessages(savedMessages);
                }
            }
            // Never update expires_at — temporary TTL is fixed at creation.
            const updated = await updateConversationRowAsync(connection, conversationId, normalizedEmail, {
                messages: messagesToSave,
                updatedAt: now,
                model,
            });
            if (updated > 0) return { id: conversationId, isTemporary: Boolean(temporary || existingRow.isTemporary) };
        }
    }
    const id = conversationId || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const isTemp = Boolean(temporary);
    await insertConversationRowAsync(connection, {
        id,
        email: normalizedEmail,
        model,
        title: title || 'New chat',
        messages: messagesToSave,
        createdAt: now,
        updatedAt: now,
        isTemporary: isTemp,
        expiresAt: isTemp ? computeExpiresAt(now) : null,
    });
    return { id, isTemporary: isTemp };
}

module.exports = {
    bumpUsageCountAsync,
    insertUsageEventAsync,
    listMemoryWorkspaceDataAsync,
    listDocumentWorkspaceItemsAsync,
    getConversationRowAsync,
    insertConversationRowAsync,
    updateConversationRowAsync,
    deleteConversationRowAsync,
    persistChatTurnAsync,
};
