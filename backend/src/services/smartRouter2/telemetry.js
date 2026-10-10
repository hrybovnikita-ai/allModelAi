const { isPostgresConnection } = require('../../db/postgresHttpReads');
const { queryPgPool, resolvePostgresAsyncPool } = require('../../db/pgPoolQuery');
const { recordProviderRequest } = require('../providerRequestTelemetry');

function recordRouterMetric(connection, row) {
    const createdAt = new Date().toISOString();
    const payload = {
        email: row.email ? String(row.email).slice(0, 200) : null,
        taskType: row.taskType || null,
        provider: row.provider || null,
        model: row.model || null,
        latencyMs: Math.max(0, Number(row.latencyMs) || 0),
        success: row.success === false ? 0 : 1,
        fallbackUsed: row.fallbackUsed ? 1 : 0,
        errorCategory: row.errorCategory || null,
        createdAt,
    };

    try {
        if (isPostgresConnection(connection)) {
            void queryPgPool(
                resolvePostgresAsyncPool(connection),
                `INSERT INTO router_metrics
                 (email, task_type, provider, model, latency_ms, success, fallback_used, error_category, created_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
                [
                    payload.email,
                    payload.taskType,
                    payload.provider,
                    payload.model,
                    payload.latencyMs,
                    payload.success,
                    payload.fallbackUsed,
                    payload.errorCategory,
                    payload.createdAt,
                ],
            ).catch((err) => {
                console.warn('[ROUTER_METRICS]', err.message);
            });
            return;
        }
        connection.database.prepare(
            `INSERT INTO router_metrics
             (email, task_type, provider, model, latency_ms, success, fallback_used, error_category, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
            payload.email,
            payload.taskType,
            payload.provider,
            payload.model,
            payload.latencyMs,
            payload.success,
            payload.fallbackUsed,
            payload.errorCategory,
            payload.createdAt,
        );
    } catch (error) {
        console.warn('[ROUTER_METRICS]', error.message);
    }

    recordProviderRequest({
        provider: row.provider,
        success: row.success !== false,
        latencyMs: row.latencyMs,
        errorCategory: row.errorCategory,
        fallbackUsed: row.fallbackUsed,
    });
}

module.exports = {
    recordRouterMetric,
};
