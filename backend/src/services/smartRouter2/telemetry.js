const { isPostgresConnection } = require('../../db/postgresHttpReads');
const { queryPgPool, resolvePostgresAsyncPool } = require('../../db/pgPoolQuery');
const { recordProviderRequest } = require('../providerRequestTelemetry');
const { insertProviderErrorEventAsync } = require('../providerHealthPersistence');
const { slugToProviderId } = require('../providerErrorClassification');

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
        } else {
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
        }
    } catch (error) {
        console.warn('[ROUTER_METRICS]', error.message);
    }

    // Always update in-memory provider telemetry (including Postgres), so health
    // status moves from "configured" → "operational" after successful traffic.
    const telemetryResult = recordProviderRequest({
        provider: slugToProviderId(row.provider) || row.provider,
        success: row.success !== false,
        latencyMs: row.latencyMs,
        errorCategory: row.errorCategory,
        httpStatus: row.httpStatus,
        message: row.errorMessage,
        timedOut: row.timedOut,
        fallbackUsed: row.fallbackUsed,
    });

    if (row.success === false && telemetryResult?.errorClass) {
        const providerId = slugToProviderId(row.provider) || telemetryResult.providerId;
        void insertProviderErrorEventAsync(connection, {
            providerId,
            errorClass: telemetryResult.errorClass,
            httpStatus: row.httpStatus,
            message: row.errorMessage,
        });
    }
}

module.exports = {
    recordRouterMetric,
};
