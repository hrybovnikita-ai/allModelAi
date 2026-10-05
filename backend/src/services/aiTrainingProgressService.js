const crypto = require('crypto');
const { queryPgPool, resolvePostgresAsyncPool } = require('../db/pgPoolQuery');

function isPostgres(connection) {
    return (connection?.engine || 'sqlite') === 'postgres';
}

async function listProgress(connection, email) {
    const sql =
        'SELECT lesson_id AS lessonId, progress, completed, updated_at AS updatedAt FROM ai_training_lesson_progress WHERE email = ? ORDER BY updated_at DESC';
    if (isPostgres(connection)) {
        const pool = resolvePostgresAsyncPool(connection);
        if (pool) {
            const result = await queryPgPool(
                pool,
                'SELECT lesson_id AS "lessonId", progress, completed, updated_at AS "updatedAt" FROM ai_training_lesson_progress WHERE email = $1 ORDER BY updated_at DESC',
                [email],
            );
            return result.rows;
        }
    }
    return connection.database.prepare(sql).all(email);
}

async function upsertProgress(connection, email, lessonId, { progress = 0, completed = 0 } = {}) {
    const now = new Date().toISOString();
    const prog = Math.max(0, Math.min(1, Number(progress) || 0));
    const done = completed ? 1 : 0;
    if (isPostgres(connection)) {
        const pool = resolvePostgresAsyncPool(connection);
        if (pool) {
            await queryPgPool(
                pool,
                `INSERT INTO ai_training_lesson_progress (email, lesson_id, progress, completed, updated_at)
                 VALUES ($1, $2, $3, $4, $5)
                 ON CONFLICT (email, lesson_id)
                 DO UPDATE SET progress = EXCLUDED.progress, completed = EXCLUDED.completed, updated_at = EXCLUDED.updated_at`,
                [email, lessonId, prog, done, now],
            );
            return { lessonId, progress: prog, completed: done, updatedAt: now };
        }
    }
    connection.database
        .prepare(
            `INSERT INTO ai_training_lesson_progress (email, lesson_id, progress, completed, updated_at)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(email, lesson_id) DO UPDATE SET
               progress = excluded.progress,
               completed = excluded.completed,
               updated_at = excluded.updated_at`,
        )
        .run(email, lessonId, prog, done, now);
    return { lessonId, progress: prog, completed: done, updatedAt: now };
}

async function recordExperiment(connection, email, lessonId, labType, config, resultSummary) {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const configJson = JSON.stringify(config);
    const summaryJson = JSON.stringify(resultSummary);
    if (isPostgres(connection)) {
        const pool = resolvePostgresAsyncPool(connection);
        if (pool) {
            await queryPgPool(
                pool,
                `INSERT INTO ai_training_experiments (id, email, lesson_id, lab_type, config, result_summary, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [id, email, lessonId, labType, configJson, summaryJson, now],
            );
            return { id, createdAt: now };
        }
    }
    connection.database
        .prepare(
            `INSERT INTO ai_training_experiments (id, email, lesson_id, lab_type, config, result_summary, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(id, email, lessonId, labType, configJson, summaryJson, now);
    return { id, createdAt: now };
}

async function listExperiments(connection, email, limit = 40) {
    const capped = Math.min(100, Math.max(1, parseInt(limit, 10) || 40));
    if (isPostgres(connection)) {
        const pool = resolvePostgresAsyncPool(connection);
        if (pool) {
            const result = await queryPgPool(
                pool,
                `SELECT id, lesson_id AS "lessonId", lab_type AS "labType", config, result_summary AS "resultSummary", created_at AS "createdAt"
                 FROM ai_training_experiments WHERE email = $1 ORDER BY created_at DESC LIMIT $2`,
                [email, capped],
            );
            return result.rows.map((row) => ({
                ...row,
                config: safeJson(row.config),
                resultSummary: safeJson(row.resultSummary),
            }));
        }
    }
    const rows = connection.database
        .prepare(
            `SELECT id, lesson_id AS lessonId, lab_type AS labType, config, result_summary AS resultSummary, created_at AS createdAt
             FROM ai_training_experiments WHERE email = ? ORDER BY created_at DESC LIMIT ?`,
        )
        .all(email, capped);
    return rows.map((row) => ({
        ...row,
        config: safeJson(row.config),
        resultSummary: safeJson(row.resultSummary),
    }));
}

function safeJson(raw) {
    try {
        return JSON.parse(raw);
    } catch {
        return {};
    }
}

module.exports = {
    listProgress,
    upsertProgress,
    recordExperiment,
    listExperiments,
};
