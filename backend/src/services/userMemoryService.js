const crypto = require('node:crypto');
const { isPostgresConnection } = require('../db/postgresHttpReads');
const { queryPgPool, resolvePostgresAsyncPool } = require('../db/pgPoolQuery');
const { isPgMissingRelationError } = require('../db/pgErrors');

async function pgQuery(connection, text, values = []) {
    return queryPgPool(resolvePostgresAsyncPool(connection), text, values);
}
const { encryptMemory, decryptMemory } = require('./userMemoryCrypto');

const MAX_MEMORIES = 200;
const MAX_MEMORY_CHARS = 2000;

function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
}

async function getSettings(connection, email) {
    const normalized = normalizeEmail(email);
    const defaults = {
        memoryEnabled: false,
        shareFeedback: true,
        excludeTemporaryFromMemory: true,
    };
    if (isPostgresConnection(connection)) {
        try {
            const result = await pgQuery(
                connection,
                `SELECT memory_enabled, share_feedback, exclude_temporary_from_memory
                 FROM user_ai_settings WHERE email = $1`,
                [normalized],
            );
            const row = result.rows[0];
            if (!row) return defaults;
            return {
                memoryEnabled: row.memory_enabled === true,
                shareFeedback: row.share_feedback !== false,
                excludeTemporaryFromMemory: row.exclude_temporary_from_memory !== false,
            };
        } catch (error) {
            if (isPgMissingRelationError(error, 'user_ai_settings')) {
                console.warn('[USER_MEMORY] user_ai_settings missing; using defaults (run npm run db:migrate)');
                return defaults;
            }
            throw error;
        }
    }
    const row = connection.database.prepare(
        `SELECT memory_enabled, share_feedback, exclude_temporary_from_memory
         FROM user_ai_settings WHERE email = ?`,
    ).get(normalized);
    if (!row) return defaults;
    return {
        memoryEnabled: Boolean(row.memory_enabled),
        shareFeedback: row.share_feedback !== 0,
        excludeTemporaryFromMemory: row.exclude_temporary_from_memory !== 0,
    };
}

async function updateSettings(connection, email, patch) {
    const normalized = normalizeEmail(email);
    const current = await getSettings(connection, email);
    const next = {
        memoryEnabled: patch.memoryEnabled ?? current.memoryEnabled,
        shareFeedback: patch.shareFeedback ?? current.shareFeedback,
        excludeTemporaryFromMemory: patch.excludeTemporaryFromMemory ?? current.excludeTemporaryFromMemory,
    };
    const now = new Date().toISOString();
    if (isPostgresConnection(connection)) {
        await pgQuery(
            connection,
            `INSERT INTO user_ai_settings (email, memory_enabled, share_feedback, exclude_temporary_from_memory, updated_at)
             VALUES ($1,$2,$3,$4,$5)
             ON CONFLICT (email) DO UPDATE SET
               memory_enabled = EXCLUDED.memory_enabled,
               share_feedback = EXCLUDED.share_feedback,
               exclude_temporary_from_memory = EXCLUDED.exclude_temporary_from_memory,
               updated_at = EXCLUDED.updated_at`,
            [normalized, next.memoryEnabled, next.shareFeedback, next.excludeTemporaryFromMemory, now],
        );
        return next;
    }
    connection.database.prepare(
        `INSERT INTO user_ai_settings (email, memory_enabled, share_feedback, exclude_temporary_from_memory, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(email) DO UPDATE SET
           memory_enabled = excluded.memory_enabled,
           share_feedback = excluded.share_feedback,
           exclude_temporary_from_memory = excluded.exclude_temporary_from_memory,
           updated_at = excluded.updated_at`,
    ).run(normalized, next.memoryEnabled ? 1 : 0, next.shareFeedback ? 1 : 0, next.excludeTemporaryFromMemory ? 1 : 0, now);
    return next;
}

async function listMemories(connection, email) {
    const normalized = normalizeEmail(email);
    if (isPostgresConnection(connection)) {
        const result = await pgQuery(
            connection,
            `SELECT id, content_preview AS "contentPreview", source_type AS "sourceType",
                    source_conversation_id AS "sourceConversationId", created_at AS "createdAt", updated_at AS "updatedAt"
             FROM user_ai_memories WHERE email = $1 ORDER BY updated_at DESC LIMIT $2`,
            [normalized, MAX_MEMORIES],
        );
        return result.rows;
    }
    return connection.database.prepare(
        `SELECT id, content_preview AS contentPreview, source_type AS sourceType,
                source_conversation_id AS sourceConversationId, created_at AS createdAt, updated_at AS updatedAt
         FROM user_ai_memories WHERE email = ? ORDER BY updated_at DESC LIMIT ?`,
    ).all(normalized, MAX_MEMORIES);
}

async function createMemory(connection, email, { content, sourceType = 'user', sourceConversationId = null }) {
    const normalized = normalizeEmail(email);
    const settings = await getSettings(connection, email);
    if (!settings.memoryEnabled) {
        const err = new Error('AI memory is disabled. Enable it in Settings first.');
        err.status = 403;
        err.code = 'MEMORY_DISABLED';
        throw err;
    }
    const text = String(content || '').trim().slice(0, MAX_MEMORY_CHARS);
    if (!text) {
        const err = new Error('Memory text is required.');
        err.status = 400;
        throw err;
    }
    const { stored, preview } = encryptMemory(text);
    const id = `mem-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    if (isPostgresConnection(connection)) {
        await pgQuery(
            connection,
            `INSERT INTO user_ai_memories
             (id, email, content_encrypted, content_preview, source_type, source_conversation_id, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$7)`,
            [id, normalized, stored, preview, sourceType, sourceConversationId, now],
        );
    } else {
        connection.database.prepare(
            `INSERT INTO user_ai_memories
             (id, email, content_encrypted, content_preview, source_type, source_conversation_id, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(id, normalized, stored, preview, sourceType, sourceConversationId, now, now);
    }
    return { id, contentPreview: preview, sourceType, sourceConversationId, createdAt: now, updatedAt: now };
}

async function updateMemory(connection, email, memoryId, content) {
    const normalized = normalizeEmail(email);
    const text = String(content || '').trim().slice(0, MAX_MEMORY_CHARS);
    if (!text) {
        const err = new Error('Memory text is required.');
        err.status = 400;
        throw err;
    }
    const { stored, preview } = encryptMemory(text);
    const now = new Date().toISOString();
    if (isPostgresConnection(connection)) {
        const result = await pgQuery(
            connection,
            `UPDATE user_ai_memories SET content_encrypted = $1, content_preview = $2, updated_at = $3
             WHERE id = $4 AND email = $5`,
            [stored, preview, now, memoryId, normalized],
        );
        if (!result.rowCount) {
            const err = new Error('Memory not found.');
            err.status = 404;
            throw err;
        }
    } else {
        const info = connection.database.prepare(
            `UPDATE user_ai_memories SET content_encrypted = ?, content_preview = ?, updated_at = ?
             WHERE id = ? AND email = ?`,
        ).run(stored, preview, now, memoryId, normalized);
        if (!info.changes) {
            const err = new Error('Memory not found.');
            err.status = 404;
            throw err;
        }
    }
    return { id: memoryId, contentPreview: preview, updatedAt: now };
}

async function deleteMemory(connection, email, memoryId) {
    const normalized = normalizeEmail(email);
    if (isPostgresConnection(connection)) {
        const result = await pgQuery(
            connection,
            'DELETE FROM user_ai_memories WHERE id = $1 AND email = $2',
            [memoryId, normalized],
        );
        if (!result.rowCount) {
            const err = new Error('Memory not found.');
            err.status = 404;
            throw err;
        }
        return { deleted: true };
    }
    const info = connection.database.prepare(
        'DELETE FROM user_ai_memories WHERE id = ? AND email = ?',
    ).run(memoryId, normalized);
    if (!info.changes) {
        const err = new Error('Memory not found.');
        err.status = 404;
        throw err;
    }
    return { deleted: true };
}

async function clearAllMemories(connection, email) {
    const normalized = normalizeEmail(email);
    if (isPostgresConnection(connection)) {
        await pgQuery(connection, 'DELETE FROM user_ai_memories WHERE email = $1', [normalized]);
    } else {
        connection.database.prepare('DELETE FROM user_ai_memories WHERE email = ?').run(normalized);
    }
    return { cleared: true };
}

async function getDecryptedMemoriesForChat(connection, email, { temporary = false } = {}) {
    const settings = await getSettings(connection, email);
    if (!settings.memoryEnabled) return [];
    if (temporary && settings.excludeTemporaryFromMemory) return [];

    const normalized = normalizeEmail(email);
    let rows;
    if (isPostgresConnection(connection)) {
        const result = await pgQuery(
            connection,
            `SELECT content_encrypted FROM user_ai_memories WHERE email = $1 ORDER BY updated_at DESC LIMIT 20`,
            [normalized],
        );
        rows = result.rows;
    } else {
        rows = connection.database.prepare(
            `SELECT content_encrypted FROM user_ai_memories WHERE email = ? ORDER BY updated_at DESC LIMIT 20`,
        ).all(normalized);
    }

    const legacy = await loadLegacyWorkspaceMemories(connection, normalized);
    const decrypted = rows
        .map((row) => decryptMemory(row.content_encrypted))
        .filter(Boolean);
    return [...decrypted, ...legacy].slice(0, 25);
}

async function loadLegacyWorkspaceMemories(connection, normalizedEmail) {
    try {
        if (isPostgresConnection(connection)) {
            const result = await pgQuery(
                connection,
                `SELECT data FROM workspace_items WHERE email = $1 AND type = 'memory' ORDER BY updated_at DESC LIMIT 10`,
                [normalizedEmail],
            );
            return result.rows.map((row) => {
                try {
                    const data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
                    return String(data?.name || data?.content || '').trim();
                } catch {
                    return '';
                }
            }).filter(Boolean);
        }
        return connection.database.prepare(
            "SELECT data FROM workspace_items WHERE email = ? AND type = 'memory' ORDER BY updated_at DESC LIMIT 10",
        ).all(normalizedEmail).map((row) => {
            try {
                const data = JSON.parse(row.data);
                return String(data?.name || data?.content || '').trim();
            } catch {
                return '';
            }
        }).filter(Boolean);
    } catch {
        return [];
    }
}

module.exports = {
    getSettings,
    updateSettings,
    listMemories,
    createMemory,
    updateMemory,
    deleteMemory,
    clearAllMemories,
    getDecryptedMemoriesForChat,
    MAX_MEMORY_CHARS,
};
