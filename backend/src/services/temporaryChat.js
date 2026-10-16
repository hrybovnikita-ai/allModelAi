'use strict';

/** Temporary chats expire exactly 72 hours after creation. Messages never extend this. */
const TEMPORARY_CHAT_TTL_MS = 72 * 60 * 60 * 1000;
const TEMPORARY_CHAT_TTL_HOURS = 72;

/** Injectable clock for tests (ms since epoch). */
let clockNowMs = null;

function setTemporaryChatClock(nowMs) {
    clockNowMs = typeof nowMs === 'number' && Number.isFinite(nowMs) ? nowMs : null;
}

function resetTemporaryChatClock() {
    clockNowMs = null;
}

function nowMs() {
    return clockNowMs == null ? Date.now() : clockNowMs;
}

function nowIso() {
    return new Date(nowMs()).toISOString();
}

function parseTimeMs(value) {
    if (value == null || value === '') return null;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const ms = Date.parse(String(value));
    return Number.isFinite(ms) ? ms : null;
}

function isTemporaryFlag(value) {
    return value === true
        || value === 1
        || value === '1'
        || value === 'true'
        || value === 't'
        || value === 'TRUE';
}

/**
 * Compute fixed expiry from creation (or now). Does not use updated_at.
 * @param {string|number|Date|null|undefined} createdAt
 * @returns {string} ISO timestamp
 */
function computeExpiresAt(createdAt) {
    const createdMs = parseTimeMs(createdAt) ?? nowMs();
    return new Date(createdMs + TEMPORARY_CHAT_TTL_MS).toISOString();
}

function isTemporaryConversation(row) {
    if (!row) return false;
    return isTemporaryFlag(row.is_temporary)
        || isTemporaryFlag(row.isTemporary)
        || isTemporaryFlag(row.temporary);
}

/**
 * True when a temporary conversation's expires_at has passed.
 * Non-temporary conversations are never considered expired by this helper.
 */
function isTemporaryExpired(row, atMs = nowMs()) {
    if (!isTemporaryConversation(row)) return false;
    const expiresMs = parseTimeMs(row.expires_at ?? row.expiresAt);
    if (expiresMs == null) {
        // Legacy/broken temp row without expires_at: treat as expired for safety.
        return true;
    }
    return atMs >= expiresMs;
}

function remainingMs(row, atMs = nowMs()) {
    if (!isTemporaryConversation(row)) return null;
    const expiresMs = parseTimeMs(row.expires_at ?? row.expiresAt);
    if (expiresMs == null) return 0;
    return Math.max(0, expiresMs - atMs);
}

/**
 * Normalize a conversation row/object for API responses.
 * Omits message content from logs — callers must not log messages.
 */
function toTemporaryMeta(row) {
    if (!row) return null;
    const temporary = isTemporaryConversation(row);
    const expiresAt = temporary
        ? (row.expires_at || row.expiresAt || computeExpiresAt(row.created_at || row.createdAt))
        : null;
    return {
        isTemporary: temporary,
        expiresAt,
        remainingMs: temporary ? remainingMs({ ...row, expires_at: expiresAt }) : null,
        expired: temporary ? isTemporaryExpired({ ...row, expires_at: expiresAt }) : false,
    };
}

/**
 * Access gate: returns { ok:true, conversation } or { ok:false, status, code, message }.
 * Expired temporary chats are inaccessible even before background cleanup runs.
 */
function assertTemporaryAccessible(row, { atMs = nowMs() } = {}) {
    if (!row) {
        return {
            ok: false,
            status: 404,
            code: 'CONVERSATION_NOT_FOUND',
            message: 'Conversation not found',
        };
    }
    if (isTemporaryExpired(row, atMs)) {
        return {
            ok: false,
            status: 410,
            code: 'TEMPORARY_CHAT_EXPIRED',
            message: 'This temporary chat has expired and is no longer available.',
        };
    }
    return { ok: true, conversation: row };
}

function isPostgresConnection(connection) {
    return (connection?.engine || 'sqlite') === 'postgres';
}

/**
 * Delete expired temporary conversations and related owned artifacts.
 * Shared conversation tokens cascade via FK where present.
 * Video jobs linked to the conversation are removed explicitly.
 */
async function purgeExpiredTemporaryConversations(connection, { atMs = nowMs(), limit = 500 } = {}) {
    if (!connection) return { deleted: 0, ids: [] };
    const cutoff = new Date(atMs).toISOString();

    if (isPostgresConnection(connection)) {
        const { queryPgPool, resolvePostgresAsyncPool } = require('../db/pgPoolQuery');
        const pool = resolvePostgresAsyncPool(connection);
        const listed = await queryPgPool(
            pool,
            `SELECT id FROM conversations
             WHERE COALESCE(is_temporary, FALSE) = TRUE
               AND expires_at IS NOT NULL
               AND expires_at <= $1::timestamptz
             ORDER BY expires_at ASC
             LIMIT $2`,
            [cutoff, limit],
        );
        const ids = (listed.rows || []).map((row) => row.id).filter(Boolean);
        if (!ids.length) return { deleted: 0, ids: [] };

        await queryPgPool(
            pool,
            `DELETE FROM video_generation_jobs WHERE conversation_id = ANY($1::text[])`,
            [ids],
        ).catch(() => ({ rowCount: 0 }));

        await queryPgPool(
            pool,
            `DELETE FROM shared_conversations WHERE conversation_id = ANY($1::text[])`,
            [ids],
        ).catch(() => ({ rowCount: 0 }));

        const deleted = await queryPgPool(
            pool,
            `DELETE FROM conversations WHERE id = ANY($1::text[])`,
            [ids],
        );
        return { deleted: deleted.rowCount ?? ids.length, ids };
    }

    const database = connection.database;
    if (!database?.prepare) return { deleted: 0, ids: [] };

    let rows = [];
    try {
        rows = database.prepare(`
            SELECT id FROM conversations
            WHERE COALESCE(is_temporary, 0) = 1
              AND expires_at IS NOT NULL
              AND expires_at <= ?
            ORDER BY expires_at ASC
            LIMIT ?
        `).all(cutoff, limit);
    } catch (error) {
        // Columns may not exist yet on very old DBs mid-migration.
        if (/no such column/i.test(String(error.message || ''))) {
            return { deleted: 0, ids: [] };
        }
        throw error;
    }

    const ids = rows.map((row) => row.id).filter(Boolean);
    if (!ids.length) return { deleted: 0, ids: [] };

    const deleteJob = database.prepare(
        'DELETE FROM video_generation_jobs WHERE conversation_id = ?',
    );
    const deleteShare = database.prepare(
        'DELETE FROM shared_conversations WHERE conversation_id = ?',
    );
    const deleteConv = database.prepare('DELETE FROM conversations WHERE id = ?');

    const tx = database.transaction((conversationIds) => {
        for (const id of conversationIds) {
            try { deleteJob.run(id); } catch { /* table may be absent */ }
            try { deleteShare.run(id); } catch { /* ignore */ }
            deleteConv.run(id);
        }
    });
    tx(ids);
    return { deleted: ids.length, ids };
}

function startTemporaryChatCleanupJob(connection, {
    intervalMs = 15 * 60 * 1000,
    onError = null,
} = {}) {
    if (!connection || process.env.NODE_ENV === 'test') {
        return { stop() {} };
    }
    const run = () => {
        Promise.resolve()
            .then(() => purgeExpiredTemporaryConversations(connection))
            .then((result) => {
                if (result.deleted > 0 && process.env.NODE_ENV !== 'test') {
                    console.log('[TEMPORARY_CHAT] purged expired', { deleted: result.deleted });
                }
            })
            .catch((error) => {
                if (typeof onError === 'function') onError(error);
                else if (process.env.NODE_ENV !== 'test') {
                    console.warn('[TEMPORARY_CHAT] cleanup failed', error.message);
                }
            });
    };
    run();
    const timer = setInterval(run, intervalMs);
    if (typeof timer.unref === 'function') timer.unref();
    return {
        stop() {
            clearInterval(timer);
        },
    };
}

module.exports = {
    TEMPORARY_CHAT_TTL_MS,
    TEMPORARY_CHAT_TTL_HOURS,
    setTemporaryChatClock,
    resetTemporaryChatClock,
    nowMs,
    nowIso,
    computeExpiresAt,
    isTemporaryFlag,
    isTemporaryConversation,
    isTemporaryExpired,
    remainingMs,
    toTemporaryMeta,
    assertTemporaryAccessible,
    purgeExpiredTemporaryConversations,
    startTemporaryChatCleanupJob,
};
