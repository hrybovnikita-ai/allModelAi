const crypto = require('node:crypto');
const { isPostgresConnection } = require('../db/postgresHttpReads');
const { queryPgPool, resolvePostgresAsyncPool } = require('../db/pgPoolQuery');
const {
    POLICY_VERSION,
    isAdaptiveRouterEnabled,
    loadProviderPerformance,
} = require('../services/smartRouter2/routerPolicy');

async function pgQuery(connection, text, values = []) {
    return queryPgPool(resolvePostgresAsyncPool(connection), text, values);
}

function parseWeights() {
    const num = (key, fallback) => {
        const v = parseFloat(process.env[key]);
        return Number.isFinite(v) ? v : fallback;
    };
    return {
        quality: num('ROUTER_SCORE_WEIGHT_QUALITY', 0.4),
        reliability: num('ROUTER_SCORE_WEIGHT_RELIABILITY', 0.3),
        speed: num('ROUTER_SCORE_WEIGHT_SPEED', 0.2),
        cost: num('ROUTER_SCORE_WEIGHT_COST', 0.1),
    };
}

function normalize01(value, min, max) {
    if (value == null || !Number.isFinite(value)) return null;
    if (max <= min) return 0.5;
    return Math.min(1, Math.max(0, (value - min) / (max - min)));
}

function computeModelScore(stats, baselines, weights) {
    const sampleSize = stats.sampleSize || 0;
    if (sampleSize < 5) {
        return {
            score: null,
            uncertainty: 'high',
            sampleSize,
            note: 'Insufficient samples (minimum 5).',
        };
    }
    const quality = stats.successRate;
    const reliability = stats.successRate;
    const speed = stats.avgLatencyMs != null
        ? 1 - (normalize01(stats.avgLatencyMs, baselines.minLatency, baselines.maxLatency) ?? 0.5)
        : null;
    const costEfficiency = 0.5;

    const parts = [];
    let totalWeight = 0;
    let weighted = 0;
    if (quality != null) {
        parts.push({ key: 'quality', value: quality, weight: weights.quality });
        weighted += weights.quality * quality;
        totalWeight += weights.quality;
    }
    if (reliability != null) {
        parts.push({ key: 'reliability', value: reliability, weight: weights.reliability });
        weighted += weights.reliability * reliability;
        totalWeight += weights.reliability;
    }
    if (speed != null) {
        parts.push({ key: 'speed', value: speed, weight: weights.speed });
        weighted += weights.speed * speed;
        totalWeight += weights.speed;
    }
    parts.push({ key: 'cost', value: costEfficiency, weight: weights.cost });
    weighted += weights.cost * costEfficiency;
    totalWeight += weights.cost;

    const score = totalWeight ? weighted / totalWeight : null;
    const uncertainty = sampleSize >= 50 ? 'low' : sampleSize >= 15 ? 'medium' : 'high';

    return {
        score: score != null ? Number(score.toFixed(4)) : null,
        uncertainty,
        sampleSize,
        components: parts,
    };
}

async function loadTaskCategoryPerformance(connection, { days = 14 } = {}) {
    if (!connection?.database && !resolvePostgresAsyncPool(connection)) return [];
    const since = new Date(Date.now() - Math.min(Math.max(Number(days) || 14, 1), 90) * 86400000).toISOString();
    try {
        if (isPostgresConnection(connection)) {
            const result = await pgQuery(
                connection,
                `SELECT COALESCE(NULLIF(TRIM(task_type), ''), 'general') AS task_type,
                        provider, model,
                        AVG(latency_ms)::float AS avg_latency,
                        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END)::int AS successes,
                        COUNT(*)::int AS total
                 FROM router_metrics
                 WHERE created_at >= $1
                 GROUP BY 1, provider, model
                 ORDER BY total DESC
                 LIMIT 200`,
                [since],
            );
            return result.rows;
        }
        return connection.database.prepare(
            `SELECT COALESCE(NULLIF(TRIM(task_type), ''), 'general') AS task_type,
                    provider, model,
                    AVG(latency_ms) AS avg_latency,
                    SUM(success) AS successes,
                    COUNT(*) AS total
             FROM router_metrics
             WHERE created_at >= ?
             GROUP BY task_type, provider, model
             ORDER BY total DESC
             LIMIT 200`,
        ).all(since);
    } catch {
        return [];
    }
}

async function buildRouterLearningDashboard(connection, { days = 14 } = {}) {
    const providerPerf = await loadProviderPerformance(connection, { days });
    const taskRows = await loadTaskCategoryPerformance(connection, { days });
    const weights = parseWeights();
    const latencies = taskRows.map((r) => Number(r.avg_latency)).filter(Number.isFinite);
    const baselines = {
        minLatency: latencies.length ? Math.min(...latencies) : 0,
        maxLatency: latencies.length ? Math.max(...latencies) : 60000,
    };

    const byProvider = Object.entries(providerPerf).map(([provider, stats]) => ({
        provider,
        ...stats,
        score: computeModelScore(
            { successRate: stats.successRate, avgLatencyMs: stats.avgLatencyMs, sampleSize: stats.sampleSize },
            baselines,
            weights,
        ),
    }));

    const byTask = taskRows.map((row) => {
        const total = Number(row.total) || 0;
        const successes = Number(row.successes) || 0;
        const stats = {
            successRate: total ? successes / total : null,
            avgLatencyMs: Number(row.avg_latency) || null,
            sampleSize: total,
        };
        return {
            taskType: row.task_type,
            provider: row.provider,
            model: row.model,
            ...stats,
            score: computeModelScore(stats, baselines, weights),
        };
    });

    let policies = [];
    try {
        if (isPostgresConnection(connection)) {
            const result = await pgQuery(
                connection,
                `SELECT id, name, version, status, config, promoted_by AS "promotedBy", created_at AS "createdAt"
                 FROM router_routing_policies ORDER BY created_at DESC LIMIT 10`,
            );
            policies = result.rows;
        } else if (connection?.database) {
            policies = connection.database.prepare(
                `SELECT id, name, version, status, config, promoted_by AS promotedBy, created_at AS createdAt
                 FROM router_routing_policies ORDER BY created_at DESC LIMIT 10`,
            ).all();
        }
    } catch {
        policies = [];
    }

    return {
        envPolicyVersion: POLICY_VERSION,
        adaptiveEnabled: isAdaptiveRouterEnabled(),
        weights,
        providerScores: byProvider,
        taskCategoryScores: byTask.slice(0, 40),
        storedPolicies: policies,
        measuredOnly: true,
    };
}

async function createCandidatePolicy(connection, email, { name, version, config }) {
    const id = `rpol-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const payload = config && typeof config === 'object' ? config : {};
    if (isPostgresConnection(connection)) {
        await pgQuery(
            connection,
            `INSERT INTO router_routing_policies (id, name, version, status, config, created_at)
             VALUES ($1,$2,$3,'candidate',$4,$5)`,
            [id, String(name || 'candidate').slice(0, 80), String(version || '0.0.1'), JSON.stringify(payload), now],
        );
    } else {
        connection.database.prepare(
            `INSERT INTO router_routing_policies (id, name, version, status, config, created_at)
             VALUES (?, ?, ?, 'candidate', ?, ?)`,
        ).run(id, String(name || 'candidate').slice(0, 80), String(version || '0.0.1'), JSON.stringify(payload), now);
    }
    return { id, status: 'candidate', createdBy: email };
}

async function promoteRoutingPolicy(connection, ownerEmail, policyId) {
    const now = new Date().toISOString();
    if (isPostgresConnection(connection)) {
        await pgQuery(connection, `UPDATE router_routing_policies SET status = 'archived' WHERE status = 'active'`);
        const updated = await pgQuery(
            connection,
            `UPDATE router_routing_policies SET status = 'active', promoted_by = $1
             WHERE id = $2 AND status = 'candidate'
             RETURNING id, name, version, status`,
            [String(ownerEmail).toLowerCase(), policyId],
        );
        if (!updated.rows[0]) {
            throw Object.assign(new Error('Candidate policy not found.'), { status: 404 });
        }
        return updated.rows[0];
    }
    connection.database.prepare(`UPDATE router_routing_policies SET status = 'archived' WHERE status = 'active'`).run();
    const result = connection.database.prepare(
        `UPDATE router_routing_policies SET status = 'active', promoted_by = ?
         WHERE id = ? AND status = 'candidate'`,
    ).run(String(ownerEmail).toLowerCase(), policyId);
    if (!result.changes) {
        throw Object.assign(new Error('Candidate policy not found.'), { status: 404 });
    }
    return connection.database.prepare(
        'SELECT id, name, version, status FROM router_routing_policies WHERE id = ?',
    ).get(policyId);
}

module.exports = {
    buildRouterLearningDashboard,
    createCandidatePolicy,
    promoteRoutingPolicy,
    computeModelScore,
};
