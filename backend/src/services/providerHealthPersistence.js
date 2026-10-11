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

async function fetchRouterMetricsSummaryAsync(connection, windowMs = 60 * 60 * 1000) {
    const since = new Date(Date.now() - windowMs).toISOString();
    try {
        if (isPostgresConnection(connection)) {
            const pool = resolvePostgresAsyncPool(connection);
            if (!pool) return {};
            const result = await queryPgPool(
                pool,
                `SELECT provider,
                        COUNT(*)::int AS total,
                        SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END)::int AS failures,
                        AVG(latency_ms)::int AS avg_latency_ms,
                        MAX(created_at) AS last_at
                 FROM router_metrics
                 WHERE created_at > $1
                 GROUP BY provider`,
                [since],
            );
            const out = {};
            for (const row of result.rows || []) {
                out[String(row.provider || '').toLowerCase()] = row;
            }
            return out;
        }
        const rows = connection.database.prepare(
            `SELECT provider,
                    COUNT(*) AS total,
                    SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS failures,
                    CAST(AVG(latency_ms) AS INTEGER) AS avg_latency_ms,
                    MAX(created_at) AS last_at
             FROM router_metrics
             WHERE created_at > ?
             GROUP BY provider`,
        ).all(since);
        const out = {};
        for (const row of rows) {
            out[String(row.provider || '').toLowerCase()] = row;
        }
        return out;
    } catch {
        return {};
    }
}

module.exports = {
    insertProviderErrorEventAsync,
    fetchRecentProviderErrorEventsAsync,
    fetchRouterMetricsSummaryAsync,
};
