const { isPostgresConnection } = require('../../db/postgresHttpReads');
const { queryPgPool, resolvePostgresAsyncPool } = require('../../db/pgPoolQuery');

const POLICY_VERSION = String(process.env.SMART_ROUTER_POLICY || 'v1').trim().toLowerCase();

function isAdaptiveRouterEnabled() {
    return POLICY_VERSION === 'v2' || POLICY_VERSION === 'adaptive';
}

async function loadProviderPerformance(connection, { days = 14 } = {}) {
    if (!connection?.database && !resolvePostgresAsyncPool(connection)) return {};
    const since = new Date(Date.now() - Math.min(Math.max(Number(days) || 14, 1), 90) * 86400000).toISOString();
    try {
        if (isPostgresConnection(connection)) {
            const result = await queryPgPool(
                resolvePostgresAsyncPool(connection),
                `SELECT provider, AVG(latency_ms)::float AS avg_latency,
                        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END)::int AS successes,
                        COUNT(*)::int AS total
                 FROM router_metrics
                 WHERE created_at >= $1 AND provider IS NOT NULL
                 GROUP BY provider`,
                [since],
            );
            return aggregateRows(result.rows);
        }
        const rows = connection.database.prepare(
            `SELECT provider, AVG(latency_ms) AS avg_latency,
                    SUM(success) AS successes, COUNT(*) AS total
             FROM router_metrics
             WHERE created_at >= ? AND provider IS NOT NULL
             GROUP BY provider`,
        ).all(since);
        return aggregateRows(rows);
    } catch {
        return {};
    }
}

function aggregateRows(rows) {
    const map = {};
    rows.forEach((row) => {
        const provider = String(row.provider || '').trim();
        if (!provider) return;
        const total = Number(row.total) || 0;
        const successes = Number(row.successes) || 0;
        map[provider] = {
            successRate: total ? successes / total : null,
            avgLatencyMs: Number(row.avg_latency) || null,
            sampleSize: total,
        };
    });
    return map;
}

function performanceBoost(slug, performanceMap) {
    const stats = performanceMap[slug];
    if (!stats || stats.sampleSize < 5 || stats.successRate == null) return 0;
    let boost = 0;
    if (stats.successRate >= 0.92) boost += 1.5;
    else if (stats.successRate >= 0.8) boost += 0.75;
    else if (stats.successRate < 0.5) boost -= 1.5;
    if (stats.avgLatencyMs != null && stats.avgLatencyMs < 4000) boost += 0.25;
    return boost;
}

module.exports = {
    POLICY_VERSION,
    isAdaptiveRouterEnabled,
    loadProviderPerformance,
    performanceBoost,
};
