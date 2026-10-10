const crypto = require('node:crypto');
const { isPostgresConnection } = require('../db/postgresHttpReads');
const { getSettings } = require('./userMemoryService');

const ALLOWED_RATINGS = new Set(['up', 'down']);
const ALLOWED_CATEGORIES = new Set([
    'incorrect',
    'incomplete',
    'unsafe',
    'off_topic',
    'formatting',
    'sources',
    'other',
]);

function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
}

async function recordFeedback(connection, email, payload) {
    const rating = String(payload.rating || '').trim().toLowerCase();
    if (!ALLOWED_RATINGS.has(rating)) {
        const err = new Error('Invalid feedback rating.');
        err.status = 400;
        throw err;
    }
    const settings = await getSettings(connection, email);
    if (!settings.shareFeedback && (payload.correctionText || payload.reasonCategory)) {
        const err = new Error('Detailed feedback sharing is disabled in your settings.');
        err.status = 403;
        err.code = 'FEEDBACK_SHARING_DISABLED';
        throw err;
    }
    const reasonCategory = payload.reasonCategory
        ? String(payload.reasonCategory).trim().toLowerCase()
        : null;
    if (reasonCategory && !ALLOWED_CATEGORIES.has(reasonCategory)) {
        const err = new Error('Invalid feedback category.');
        err.status = 400;
        throw err;
    }
    const id = `fb-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const normalized = normalizeEmail(email);
    const row = {
        id,
        email: normalized,
        conversationId: payload.conversationId ? String(payload.conversationId).slice(0, 120) : null,
        messageIndex: Number.isFinite(Number(payload.messageIndex)) ? Number(payload.messageIndex) : null,
        rating,
        reasonCategory,
        correctionText: payload.correctionText ? String(payload.correctionText).trim().slice(0, 4000) : null,
        modelSlug: payload.modelSlug ? String(payload.modelSlug).slice(0, 80) : null,
        routedModel: payload.routedModel ? String(payload.routedModel).slice(0, 80) : null,
        createdAt: now,
    };

    if (isPostgresConnection(connection)) {
        await connection.pool.query(
            `INSERT INTO response_feedback
             (id, email, conversation_id, message_index, rating, reason_category, correction_text, model_slug, routed_model, created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
            [
                row.id,
                row.email,
                row.conversationId,
                row.messageIndex,
                row.rating,
                row.reasonCategory,
                row.correctionText,
                row.modelSlug,
                row.routedModel,
                row.createdAt,
            ],
        );
    } else {
        connection.database.prepare(
            `INSERT INTO response_feedback
             (id, email, conversation_id, message_index, rating, reason_category, correction_text, model_slug, routed_model, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
            row.id,
            row.email,
            row.conversationId,
            row.messageIndex,
            row.rating,
            row.reasonCategory,
            row.correctionText,
            row.modelSlug,
            row.routedModel,
            row.createdAt,
        );
    }
    return { id: row.id, recorded: true };
}

async function summarizeFeedback(connection, { days = 30 } = {}) {
    const windowDays = Math.min(Math.max(Number(days) || 30, 1), 365);
    const since = new Date(Date.now() - windowDays * 86400000).toISOString();
    if (isPostgresConnection(connection)) {
        const totals = await connection.pool.query(
            `SELECT rating, COUNT(*)::int AS count
             FROM response_feedback WHERE created_at >= $1 GROUP BY rating`,
            [since],
        );
        const categories = await connection.pool.query(
            `SELECT reason_category AS category, COUNT(*)::int AS count
             FROM response_feedback
             WHERE created_at >= $1 AND reason_category IS NOT NULL
             GROUP BY reason_category ORDER BY count DESC LIMIT 12`,
            [since],
        );
        return {
            windowDays,
            totals: totals.rows,
            categories: categories.rows,
        };
    }
    const totals = connection.database.prepare(
        `SELECT rating, COUNT(*) AS count FROM response_feedback WHERE created_at >= ? GROUP BY rating`,
    ).all(since);
    const categories = connection.database.prepare(
        `SELECT reason_category AS category, COUNT(*) AS count
         FROM response_feedback
         WHERE created_at >= ? AND reason_category IS NOT NULL
         GROUP BY reason_category ORDER BY count DESC LIMIT 12`,
    ).all(since);
    return { windowDays, totals, categories };
}

module.exports = {
    recordFeedback,
    summarizeFeedback,
    ALLOWED_CATEGORIES,
};
