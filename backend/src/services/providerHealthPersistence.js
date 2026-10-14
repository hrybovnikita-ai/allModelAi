const { isPostgresConnection } = require('../db/postgresHttpReads');
const { queryPgPool, resolvePostgresAsyncPool } = require('../db/pgPoolQuery');
const { sanitizeProviderHint } = require('./providerErrorClassification');

const RETENTION_DAYS = Number(process.env.PROVIDER_ERROR_EVENT_RETENTION_DAYS) || 30;

async function insertProviderErrorEventAsync(connection, row) {
    if (!connection || !row?.providerId || !row?.errorClass) return;
    const payload = {
        providerId: String(row.providerId).slice(0, 64),
        errorClass: String(row.errorClass).slice(0, 64),
        httpStatus: row.httpStatus == null ? null : Number(row.httpStatus) || null,
        hint: sanitizeProviderHint(row.message),
        createdAt: new Date().toISOString(),
    };

    try {
        if (isPostgresConnection(connection)) {
            const pool = resolvePostgresAsyncPool(connection);
            if (!pool) return;
            await queryPgPool(
                pool,
                `INSERT INTO provider_error_events (provider_id, error_class, http_status, sanitized_hint, created_at)
                 VALUES ($1,$2,$3,$4,$5)`,
                [payload.providerId, payload.errorClass, payload.httpStatus, payload.hint, payload.createdAt],
            );
            return;
        }
        connection.database.prepare(
            `INSERT INTO provider_error_events (provider_id, error_class, http_status, sanitized_hint, created_at)
             VALUES (?, ?, ?, ?, ?)`,
        ).run(payload.providerId, payload.errorClass, payload.httpStatus, payload.hint, payload.createdAt);
    } catch (error) {
        if (/no such table/i.test(String(error.message))) return;
        console.warn('[PROVIDER_HEALTH]', error.message);
    }
}

async function fetchRecentProviderErrorEventsAsync(connection, { limit = 40 } = {}) {
    const cap = Math.min(100, Math.max(1, Number(limit) || 40));
    try {
        if (isPostgresConnection(connection)) {
            const pool = resolvePostgresAsyncPool(connection);
            if (!pool) return [];
            const result = await queryPgPool(
                pool,
                `SELECT provider_id, error_class, http_status, sanitized_hint, created_at
                 FROM provider_error_events
                 WHERE created_at > NOW() - INTERVAL '1 day' * $1
                 ORDER BY created_at DESC
                 LIMIT $2`,
                [RETENTION_DAYS, cap],
            );
            return result.rows || [];
        }
        return connection.database.prepare(
            `SELECT provider_id, error_class, http_status, sanitized_hint, created_at
             FROM provider_error_events
             ORDER BY created_at DESC
             LIMIT ?`,
        ).all(cap);
    } catch {
        return [];
    }
}

async function fetchRouterMetricsSummaryAsync(connection, windowMs = 60 * 60 * 1000, groupField = 'provider') {
    const since = new Date(Date.now() - windowMs).toISOString();
    const column = groupField === 'model' ? 'model' : 'provider';
    try {
        if (isPostgresConnection(connection)) {
            const pool = resolvePostgresAsyncPool(connection);
            if (!pool) return {};
            const result = await queryPgPool(
                pool,
                `SELECT ${column} AS group_key,
                        COUNT(*)::int AS total,
                        SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END)::int AS failures,
                        AVG(latency_ms)::int AS avg_latency_ms,
                        MAX(created_at) AS last_at,
                        MAX(CASE WHEN success = 1 THEN created_at END) AS last_success_at,
                        MAX(CASE WHEN success = 0 THEN error_category END) AS last_error_category
                 FROM router_metrics
                 WHERE created_at > $1 AND ${column} IS NOT NULL
                 GROUP BY ${column}`,
                [since],
            );
            const out = {};
            for (const row of result.rows || []) {
                out[String(row.group_key || '').toLowerCase()] = {
                    total: row.total,
                    failures: row.failures,
                    avg_latency_ms: row.avg_latency_ms,
                    last_at: row.last_at,
                    last_success_at: row.last_success_at,
                    last_error_category: row.last_error_category,
                };
            }
            return out;
        }
        const rows = connection.database.prepare(
            `SELECT ${column} AS group_key,
                    COUNT(*) AS total,
                    SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS failures,
                    CAST(AVG(latency_ms) AS INTEGER) AS avg_latency_ms,
                    MAX(created_at) AS last_at,
                    MAX(CASE WHEN success = 1 THEN created_at END) AS last_success_at,
                    MAX(CASE WHEN success = 0 THEN error_category END) AS last_error_category
             FROM router_metrics
             WHERE created_at > ? AND ${column} IS NOT NULL
             GROUP BY ${column}`,
        ).all(since);
        const out = {};
        for (const row of rows) {
            out[String(row.group_key || '').toLowerCase()] = row;
        }
        return out;
    } catch {
        return {};
    }
}

async function fetchRouterMetricsBucketsAsync(connection, { windowMs = 60 * 60 * 1000, bucketMs = null } = {}) {
    const bucket = bucketMs || Math.max(60_000, Math.floor(windowMs / 24));
    const since = new Date(Date.now() - windowMs).toISOString();
    try {
        if (isPostgresConnection(connection)) {
            const pool = resolvePostgresAsyncPool(connection);
            if (!pool) return [];
            const result = await queryPgPool(
                pool,
                `SELECT date_trunc('minute', created_at) AS bucket_start,
                        provider,
                        COUNT(*)::int AS total,
                        SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END)::int AS failures,
                        AVG(latency_ms)::int AS avg_latency_ms
                 FROM router_metrics
                 WHERE created_at > $1
                 GROUP BY bucket_start, provider
                 ORDER BY bucket_start ASC`,
                [since],
            );
            return (result.rows || []).map((row) => ({
                bucketStart: row.bucket_start,
                provider: row.provider,
                total: row.total,
                failures: row.failures,
                avg_latency_ms: row.avg_latency_ms,
            }));
        }
        const rows = connection.database.prepare(
            `SELECT strftime('%Y-%m-%dT%H:%M:00.000Z', created_at) AS bucket_start,
                    provider,
                    COUNT(*) AS total,
                    SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS failures,
                    CAST(AVG(latency_ms) AS INTEGER) AS avg_latency_ms
             FROM router_metrics
             WHERE created_at > ?
             GROUP BY bucket_start, provider
             ORDER BY bucket_start ASC`,
        ).all(since);
        return rows.map((row) => ({
            bucketStart: row.bucket_start,
            provider: row.provider,
            total: row.total,
            failures: row.failures,
            avg_latency_ms: row.avg_latency_ms,
        }));
    } catch {
        return [];
    }
}

async function pruneProviderErrorEventsAsync(connection) {
    try {
        if (isPostgresConnection(connection)) {
            const pool = resolvePostgresAsyncPool(connection);
            if (!pool) return;
            await queryPgPool(
                pool,
                `DELETE FROM provider_error_events WHERE created_at < NOW() - INTERVAL '1 day' * $1`,
                [RETENTION_DAYS],
            );
            return;
        }
        const cutoff = new Date(Date.now() - RETENTION_DAYS * 86400000).toISOString();
        connection.database.prepare(
            'DELETE FROM provider_error_events WHERE created_at < ?',
        ).run(cutoff);
    } catch {
        /* ignore */
    }
}

module.exports = {
    insertProviderErrorEventAsync,
    fetchRecentProviderErrorEventsAsync,
    fetchRouterMetricsSummaryAsync,
    fetchRouterMetricsBucketsAsync,
    pruneProviderErrorEventsAsync,
};
