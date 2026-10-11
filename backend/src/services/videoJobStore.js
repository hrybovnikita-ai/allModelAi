const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');
const { isPostgresConnection } = require('../db/postgresHttpReads');
const { queryPgPool, resolvePostgresAsyncPool } = require('../db/pgPoolQuery');

const STORAGE_DIR = path.join(__dirname, '..', '..', 'storage', 'generated-videos');

function nowIso() {
    return new Date().toISOString();
}

async function pgQuery(connection, text, values = []) {
    return queryPgPool(resolvePostgresAsyncPool(connection), text, values);
}

function getDb(connection) {
    return connection.database;
}

function rowToJob(row) {
    if (!row) return null;
    return {
        id: row.id,
        email: row.email,
        provider: row.provider,
        providerProjectId: row.provider_project_id ?? row.providerProjectId,
        mode: row.mode,
        prompt: row.prompt,
        status: row.status,
        aspectRatio: row.aspect_ratio ?? row.aspectRatio,
        resolution: row.resolution,
        model: row.model,
        durationSeconds: row.duration_seconds ?? row.durationSeconds,
        creditsEstimated: row.credits_estimated ?? row.creditsEstimated,
        creditsCharged: row.credits_charged ?? row.creditsCharged,
        videoUrl: row.video_url ?? row.videoUrl,
        storedRelativePath: row.stored_relative_path ?? row.storedRelativePath,
        mimeType: row.mime_type || row.mimeType || 'video/mp4',
        errorCode: row.error_code ?? row.errorCode,
        errorMessage: row.error_message ?? row.errorMessage,
        conversationId: row.conversation_id ?? row.conversationId ?? null,
        messageId: row.message_id ?? row.messageId ?? null,
        createdAt: row.created_at ?? row.createdAt,
        updatedAt: row.updated_at ?? row.updatedAt,
    };
}

async function createJob(connection, payload) {
    const id = payload.id || `vjob-${crypto.randomUUID()}`;
    const createdAt = nowIso();
    if (isPostgresConnection(connection)) {
        await pgQuery(
            connection,
            `INSERT INTO video_generation_jobs (
                id, email, provider, provider_project_id, mode, prompt, status,
                aspect_ratio, resolution, model, duration_seconds,
                credits_estimated, credits_charged, video_url, stored_relative_path, mime_type,
                error_code, error_message, conversation_id, message_id, created_at, updated_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
            [
                id,
                payload.email,
                payload.provider,
                payload.providerProjectId || null,
                payload.mode,
                payload.prompt,
                payload.status || 'preparing',
                payload.aspectRatio || null,
                payload.resolution || null,
                payload.model || null,
                payload.durationSeconds ?? null,
                payload.creditsEstimated ?? null,
                payload.creditsCharged ?? null,
                payload.videoUrl || null,
                payload.storedRelativePath || null,
                payload.mimeType || 'video/mp4',
                payload.errorCode || null,
                payload.errorMessage || null,
                payload.conversationId || null,
                payload.messageId || null,
                createdAt,
                createdAt,
            ],
        );
        return getJobById(connection, id);
    }
    const db = getDb(connection);
    db.prepare(`
        INSERT INTO video_generation_jobs (
            id, email, provider, provider_project_id, mode, prompt, status,
            aspect_ratio, resolution, model, duration_seconds,
            credits_estimated, credits_charged, video_url, stored_relative_path, mime_type,
            error_code, error_message, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        id,
        payload.email,
        payload.provider,
        payload.providerProjectId || null,
        payload.mode,
        payload.prompt,
        payload.status || 'preparing',
        payload.aspectRatio || null,
        payload.resolution || null,
        payload.model || null,
        payload.durationSeconds ?? null,
        payload.creditsEstimated ?? null,
        payload.creditsCharged ?? null,
        payload.videoUrl || null,
        payload.storedRelativePath || null,
        payload.mimeType || 'video/mp4',
        payload.errorCode || null,
        payload.errorMessage || null,
        createdAt,
        createdAt,
    );
    return getJobById(connection, id);
}

async function updateJob(connection, id, patch) {
    const current = await getJobById(connection, id);
    if (!current) return null;
    const updatedAt = nowIso();
    if (isPostgresConnection(connection)) {
        await pgQuery(
            connection,
            `UPDATE video_generation_jobs SET
                provider_project_id = COALESCE($1, provider_project_id),
                status = COALESCE($2, status),
                credits_estimated = COALESCE($3, credits_estimated),
                credits_charged = COALESCE($4, credits_charged),
                video_url = COALESCE($5, video_url),
                stored_relative_path = COALESCE($6, stored_relative_path),
                mime_type = COALESCE($7, mime_type),
                error_code = COALESCE($8, error_code),
                error_message = COALESCE($9, error_message),
                updated_at = $10
            WHERE id = $11`,
            [
                patch.providerProjectId ?? null,
                patch.status ?? null,
                patch.creditsEstimated ?? null,
                patch.creditsCharged ?? null,
                patch.videoUrl ?? null,
                patch.storedRelativePath ?? null,
                patch.mimeType ?? null,
                patch.errorCode ?? null,
                patch.errorMessage ?? null,
                updatedAt,
                id,
            ],
        );
        return getJobById(connection, id);
    }
    getDb(connection).prepare(`
        UPDATE video_generation_jobs SET
            provider_project_id = COALESCE(?, provider_project_id),
            status = COALESCE(?, status),
            credits_estimated = COALESCE(?, credits_estimated),
            credits_charged = COALESCE(?, credits_charged),
            video_url = COALESCE(?, video_url),
            stored_relative_path = COALESCE(?, stored_relative_path),
            mime_type = COALESCE(?, mime_type),
            error_code = COALESCE(?, error_code),
            error_message = COALESCE(?, error_message),
            updated_at = ?
        WHERE id = ?
    `).run(
        patch.providerProjectId ?? null,
        patch.status ?? null,
        patch.creditsEstimated ?? null,
        patch.creditsCharged ?? null,
        patch.videoUrl ?? null,
        patch.storedRelativePath ?? null,
        patch.mimeType ?? null,
        patch.errorCode ?? null,
        patch.errorMessage ?? null,
        updatedAt,
        id,
    );
    return getJobById(connection, id);
}

async function getJobById(connection, id) {
    if (isPostgresConnection(connection)) {
        const result = await pgQuery(connection, 'SELECT * FROM video_generation_jobs WHERE id = $1', [id]);
        return rowToJob(result.rows[0]);
    }
    const row = getDb(connection).prepare('SELECT * FROM video_generation_jobs WHERE id = ?').get(id);
    return rowToJob(row);
}

async function getJobForUser(connection, id, email) {
    if (isPostgresConnection(connection)) {
        const result = await pgQuery(
            connection,
            'SELECT * FROM video_generation_jobs WHERE id = $1 AND lower(email) = lower($2)',
            [id, email],
        );
        return rowToJob(result.rows[0]);
    }
    const row = getDb(connection).prepare(
        'SELECT * FROM video_generation_jobs WHERE id = ? AND lower(email) = lower(?)',
    ).get(id, email);
    return rowToJob(row);
}

async function listActiveJobsForUser(connection, email, { limit = 10 } = {}) {
    if (isPostgresConnection(connection)) {
        const result = await pgQuery(
            connection,
            `SELECT * FROM video_generation_jobs
             WHERE lower(email) = lower($1)
               AND status IN ('preparing', 'queued', 'generating')
             ORDER BY created_at DESC
             LIMIT $2`,
            [email, limit],
        );
        return result.rows.map(rowToJob);
    }
    const rows = getDb(connection).prepare(`
        SELECT * FROM video_generation_jobs
        WHERE lower(email) = lower(?)
          AND status IN ('preparing', 'queued', 'generating')
        ORDER BY datetime(created_at) DESC
        LIMIT ?
    `).all(email, limit);
    return rows.map(rowToJob);
}

async function findRecentDuplicateJob(connection, email, params, { windowMs = 300000 } = {}) {
    const prompt = typeof params === 'string' ? params : params?.prompt;
    const aspectRatio = typeof params === 'object' ? (params.aspectRatio || null) : null;
    const resolution = typeof params === 'object' ? (params.resolution || null) : null;
    const durationSeconds = typeof params === 'object' ? (params.durationSeconds ?? null) : null;
    const since = new Date(Date.now() - windowMs).toISOString();
    if (isPostgresConnection(connection)) {
        const result = await pgQuery(
            connection,
            `SELECT * FROM video_generation_jobs
             WHERE lower(email) = lower($1)
               AND prompt = $2
               AND status IN ('preparing', 'queued', 'generating')
               AND created_at >= $3
               AND ($4::text IS NULL OR aspect_ratio = $4)
               AND ($5::text IS NULL OR resolution = $5)
               AND ($6::int IS NULL OR duration_seconds = $6)
             ORDER BY created_at DESC
             LIMIT 1`,
            [email, prompt, since, aspectRatio, resolution, durationSeconds],
        );
        return rowToJob(result.rows[0]);
    }
    const row = getDb(connection).prepare(`
        SELECT * FROM video_generation_jobs
        WHERE lower(email) = lower(?)
          AND prompt = ?
          AND status IN ('preparing', 'queued', 'generating')
          AND created_at >= ?
          AND (? IS NULL OR aspect_ratio = ?)
          AND (? IS NULL OR resolution = ?)
          AND (? IS NULL OR duration_seconds = ?)
        ORDER BY created_at DESC
        LIMIT 1
    `).get(
        email,
        prompt,
        since,
        aspectRatio,
        aspectRatio,
        resolution,
        resolution,
        durationSeconds,
        durationSeconds,
    );
    return rowToJob(row);
}

async function countActiveJobsForUser(connection, email) {
    if (isPostgresConnection(connection)) {
        const result = await pgQuery(
            connection,
            `SELECT COUNT(*)::int AS count FROM video_generation_jobs
             WHERE lower(email) = lower($1)
               AND status IN ('preparing', 'queued', 'generating')`,
            [email],
        );
        return result.rows[0]?.count || 0;
    }
    const row = getDb(connection).prepare(`
        SELECT COUNT(*) AS count FROM video_generation_jobs
        WHERE lower(email) = lower(?)
          AND status IN ('preparing', 'queued', 'generating')
    `).get(email);
    return row?.count || 0;
}

function ensureStorageDir() {
    if (!fs.existsSync(STORAGE_DIR)) {
        fs.mkdirSync(STORAGE_DIR, { recursive: true });
    }
}

function persistVideoBuffer(jobId, buffer) {
    ensureStorageDir();
    const filename = `${jobId}.mp4`;
    const absolute = path.join(STORAGE_DIR, filename);
    fs.writeFileSync(absolute, buffer);
    return path.join('generated-videos', filename).replace(/\\/g, '/');
}

function readStoredVideo(relativePath) {
    if (!relativePath) return null;
    const absolute = path.join(__dirname, '..', '..', 'storage', relativePath);
    if (!fs.existsSync(absolute)) return null;
    return fs.readFileSync(absolute);
}

function absolutePathForJob(relativePath) {
    if (!relativePath) return null;
    return path.join(__dirname, '..', '..', 'storage', relativePath);
}

module.exports = {
    createJob,
    updateJob,
    getJobById,
    getJobForUser,
    listActiveJobsForUser,
    findRecentDuplicateJob,
    countActiveJobsForUser,
    persistVideoBuffer,
    readStoredVideo,
    absolutePathForJob,
};
