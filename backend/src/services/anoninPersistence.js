const { isPostgresConnection } = require('../db/postgresHttpReads');
const { queryPgPool, resolvePostgresAsyncPool } = require('../db/pgPoolQuery');

function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
}

function sqliteExec(connection, sql, params = []) {
    connection.database.prepare(sql).run(...params);
}

function sqliteGet(connection, sql, params = []) {
    return connection.database.prepare(sql).get(...params) || null;
}

function sqliteAll(connection, sql, params = []) {
    return connection.database.prepare(sql).all(...params) || [];
}

async function getConversationAssignmentAsync(connection, email, conversationId) {
    if (!connection || !conversationId) return null;
    const normalizedEmail = normalizeEmail(email);
    try {
        if (isPostgresConnection(connection)) {
            const pool = resolvePostgresAsyncPool(connection);
            if (!pool) return null;
            const result = await queryPgPool(
                pool,
                `SELECT assigned_slug, strategy, updated_at
                 FROM anonin_conversation_state
                 WHERE conversation_id = $1 AND email = $2`,
                [conversationId, normalizedEmail],
            );
            return result.rows?.[0] || null;
        }
        return sqliteGet(
            connection,
            `SELECT assigned_slug AS assigned_slug, strategy, updated_at
             FROM anonin_conversation_state
             WHERE conversation_id = ? AND email = ?`,
            [conversationId, normalizedEmail],
        );
    } catch (error) {
        if (/no such table/i.test(String(error.message))) return null;
        console.warn('[ANONIN]', error.message);
        return null;
    }
}

async function setConversationAssignmentAsync(connection, email, conversationId, assignedSlug, strategy) {
    if (!connection || !conversationId || !assignedSlug) return;
    const normalizedEmail = normalizeEmail(email);
    const now = new Date().toISOString();
    try {
        if (isPostgresConnection(connection)) {
            const pool = resolvePostgresAsyncPool(connection);
            if (!pool) return;
            await queryPgPool(
                pool,
                `INSERT INTO anonin_conversation_state (conversation_id, email, assigned_slug, strategy, updated_at)
                 VALUES ($1,$2,$3,$4,$5)
                 ON CONFLICT (conversation_id, email)
                 DO UPDATE SET assigned_slug = EXCLUDED.assigned_slug, strategy = EXCLUDED.strategy, updated_at = EXCLUDED.updated_at`,
                [conversationId, normalizedEmail, assignedSlug, strategy, now],
            );
            return;
        }
        sqliteExec(
            connection,
            `INSERT INTO anonin_conversation_state (conversation_id, email, assigned_slug, strategy, updated_at)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(conversation_id, email) DO UPDATE SET
               assigned_slug = excluded.assigned_slug,
               strategy = excluded.strategy,
               updated_at = excluded.updated_at`,
            [conversationId, normalizedEmail, assignedSlug, strategy, now],
        );
    } catch (error) {
        if (/no such table/i.test(String(error.message))) return;
        console.warn('[ANONIN]', error.message);
    }
}

async function saveMessageIdentityAsync(connection, row) {
    if (!connection || !row?.messageId || !row?.email || !row?.actualSlug) return;
    const normalizedEmail = normalizeEmail(row.email);
    const now = new Date().toISOString();
    try {
        if (isPostgresConnection(connection)) {
            const pool = resolvePostgresAsyncPool(connection);
            if (!pool) return;
            await queryPgPool(
                pool,
                `INSERT INTO anonin_message_identity (
                    message_id, conversation_id, email, actual_slug, provider_label, model_label,
                    gateway_model_id, strategy, fallback_from_slug, created_at
                 ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
                 ON CONFLICT (message_id) DO NOTHING`,
                [
                    row.messageId,
                    row.conversationId || null,
                    normalizedEmail,
                    row.actualSlug,
                    row.providerLabel,
                    row.modelLabel,
                    row.gatewayModelId || null,
                    row.strategy || 'random',
                    row.fallbackFromSlug || null,
                    now,
                ],
            );
            return;
        }
        sqliteExec(
            connection,
            `INSERT OR IGNORE INTO anonin_message_identity (
                message_id, conversation_id, email, actual_slug, provider_label, model_label,
                gateway_model_id, strategy, fallback_from_slug, created_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                row.messageId,
                row.conversationId || null,
                normalizedEmail,
                row.actualSlug,
                row.providerLabel,
                row.modelLabel,
                row.gatewayModelId || null,
                row.strategy || 'random',
                row.fallbackFromSlug || null,
                now,
            ],
        );
    } catch (error) {
        if (/no such table/i.test(String(error.message))) return;
        console.warn('[ANONIN]', error.message);
    }
}

async function getMessageIdentityAsync(connection, email, messageId) {
    if (!connection || !messageId) return null;
    const normalizedEmail = normalizeEmail(email);
    try {
        if (isPostgresConnection(connection)) {
            const pool = resolvePostgresAsyncPool(connection);
            if (!pool) return null;
            const result = await queryPgPool(
                pool,
                `SELECT message_id, conversation_id, actual_slug, provider_label, model_label,
                        gateway_model_id, strategy, fallback_from_slug, created_at, revealed_at
                 FROM anonin_message_identity
                 WHERE message_id = $1 AND email = $2`,
                [messageId, normalizedEmail],
            );
            return result.rows?.[0] || null;
        }
        return sqliteGet(
            connection,
            `SELECT message_id, conversation_id, actual_slug, provider_label, model_label,
                    gateway_model_id, strategy, fallback_from_slug, created_at, revealed_at
             FROM anonin_message_identity
             WHERE message_id = ? AND email = ?`,
            [messageId, normalizedEmail],
        );
    } catch (error) {
        if (/no such table/i.test(String(error.message))) return null;
        return null;
    }
}

async function markMessageRevealedAsync(connection, email, messageId) {
    if (!connection || !messageId) return null;
    const normalizedEmail = normalizeEmail(email);
    const now = new Date().toISOString();
    try {
        if (isPostgresConnection(connection)) {
            const pool = resolvePostgresAsyncPool(connection);
            if (!pool) return null;
            const result = await queryPgPool(
                pool,
                `UPDATE anonin_message_identity
                 SET revealed_at = COALESCE(revealed_at, $3)
                 WHERE message_id = $1 AND email = $2
                 RETURNING message_id, actual_slug, provider_label, model_label, gateway_model_id,
                           strategy, fallback_from_slug, revealed_at`,
                [messageId, normalizedEmail, now],
            );
            return result.rows?.[0] || null;
        }
        sqliteExec(
            connection,
            `UPDATE anonin_message_identity
             SET revealed_at = COALESCE(revealed_at, ?)
             WHERE message_id = ? AND email = ?`,
            [now, messageId, normalizedEmail],
        );
        return getMessageIdentityAsync(connection, email, messageId);
    } catch {
        return null;
    }
}

async function listRevealedMessageIdsAsync(connection, email, conversationId) {
    if (!connection || !conversationId) return [];
    const normalizedEmail = normalizeEmail(email);
    try {
        if (isPostgresConnection(connection)) {
            const pool = resolvePostgresAsyncPool(connection);
            if (!pool) return [];
            const result = await queryPgPool(
                pool,
                `SELECT message_id FROM anonin_message_identity
                 WHERE email = $1 AND conversation_id = $2 AND revealed_at IS NOT NULL`,
                [normalizedEmail, conversationId],
            );
            return (result.rows || []).map((r) => r.message_id);
        }
        const rows = sqliteAll(
            connection,
            `SELECT message_id FROM anonin_message_identity
             WHERE email = ? AND conversation_id = ? AND revealed_at IS NOT NULL`,
            [normalizedEmail, conversationId],
        );
        return rows.map((r) => r.message_id);
    } catch {
        return [];
    }
}

module.exports = {
    getConversationAssignmentAsync,
    setConversationAssignmentAsync,
    saveMessageIdentityAsync,
    getMessageIdentityAsync,
    markMessageRevealedAsync,
    listRevealedMessageIdsAsync,
};
