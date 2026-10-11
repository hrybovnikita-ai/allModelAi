const crypto = require('node:crypto');
const { isPostgresConnection } = require('../db/postgresHttpReads');
const {
    listBackgroundJobsAsync,
    getBackgroundJobAsync,
    insertBackgroundJobAsync,
    updateBackgroundJobAsync,
    cancelBackgroundJobAsync,
} = require('../db/postgresHttpProduction');
const { JOB_TYPES } = require('./featureRegistry');
const { assertFeatureEnabled, getPlatformCapabilities } = require('./featureAccess');
const { logPlatformEvent } = require('./platformAudit');

function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
}

function rowToJob(row) {
    if (!row) return null;
    return {
        id: row.id,
        email: row.email,
        type: row.type,
        status: row.status,
        progress: row.progress ?? 0,
        stage: row.stage,
        payload: (() => {
            try {
                return JSON.parse(row.payload || '{}');
            } catch {
                return {};
            }
        })(),
        result: row.result ? (() => {
            try {
                return JSON.parse(row.result);
            } catch {
                return row.result;
            }
        })() : null,
        error: row.error || null,
        createdAt: row.created_at ?? row.createdAt,
        updatedAt: row.updated_at ?? row.updatedAt,
    };
}

async function listJobsForUser(connection, email) {
    const normalized = normalizeEmail(email);
    if (isPostgresConnection(connection)) {
        const rows = await listBackgroundJobsAsync(connection, normalized);
        return rows.map(rowToJob);
    }
    return connection.database.prepare(
        'SELECT * FROM background_jobs WHERE email = ? ORDER BY created_at DESC LIMIT 100',
    ).all(normalized).map(rowToJob);
}

async function getJobForUser(connection, jobId, email) {
    const normalized = normalizeEmail(email);
    let row;
    if (isPostgresConnection(connection)) {
        row = await getBackgroundJobAsync(connection, jobId);
    } else {
        row = connection.database.prepare('SELECT * FROM background_jobs WHERE id = ?').get(jobId);
    }
    if (!row || normalizeEmail(row.email) !== normalized) return null;
    return rowToJob(row);
}

async function enqueuePlatformJob(connection, {
    email,
    type,
    payload = {},
    access,
    ip,
}) {
    const meta = JOB_TYPES[type];
    if (!meta) {
        const err = new Error(`Unknown platform job type: ${type}`);
        err.status = 400;
        err.code = 'INVALID_JOB_TYPE';
        throw err;
    }
    const capabilities = await getPlatformCapabilities(connection, email, access);
    assertFeatureEnabled(capabilities, meta.featureId);

    const id = `pjob-${crypto.randomUUID()}`;
    const createdAt = new Date().toISOString();
    const row = {
        id,
        email: normalizeEmail(email),
        type,
        payload: { ...payload, featureId: meta.featureId },
        createdAt,
    };

    if (isPostgresConnection(connection)) {
        await insertBackgroundJobAsync(connection, row);
    } else {
        connection.database.prepare(
            `INSERT INTO background_jobs (id, email, type, status, progress, stage, payload, created_at, updated_at)
             VALUES (?, ?, ?, 'queued', 0, 'Queued', ?, ?, ?)`,
        ).run(id, row.email, type, JSON.stringify(row.payload), createdAt, createdAt);
    }

    await logPlatformEvent(connection, {
        email: row.email,
        featureId: meta.featureId,
        action: 'job.enqueued',
        resourceType: 'platform_job',
        resourceId: id,
        metadata: { jobType: type },
        ip,
    });

    return getJobForUser(connection, id, row.email);
}

async function cancelJobForUser(connection, jobId, email) {
    const normalized = normalizeEmail(email);
    const job = await getJobForUser(connection, jobId, normalized);
    if (!job) {
        const err = new Error('Job not found.');
        err.status = 404;
        throw err;
    }
    const updatedAt = new Date().toISOString();
    if (isPostgresConnection(connection)) {
        const changes = await cancelBackgroundJobAsync(connection, jobId, normalized, updatedAt);
        if (!changes) {
            const err = new Error('Job cannot be canceled.');
            err.status = 409;
            throw err;
        }
    } else {
        const result = connection.database.prepare(
            `UPDATE background_jobs SET status = 'canceled', stage = 'Canceled', updated_at = ?
             WHERE id = ? AND email = ? AND status IN ('queued', 'running')`,
        ).run(updatedAt, jobId, normalized);
        if (!result.changes) {
            const err = new Error('Job cannot be canceled.');
            err.status = 409;
            throw err;
        }
    }
    return getJobForUser(connection, jobId, normalized);
}

module.exports = {
    listJobsForUser,
    getJobForUser,
    enqueuePlatformJob,
    cancelJobForUser,
    rowToJob,
};
