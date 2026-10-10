const { getDatabaseEngine } = require('../db/provider');
const { isPostgresConnection } = require('../db/postgresHttpReads');
const { pingPostgresAsync, countActiveSessionsAsync } = require('../db/postgresHttpProduction');
const { buildProviderHealth, buildProviderSnapshot } = require('../providerHealth');
const {
    summarizeWindow,
    recentAlerts,
    uptimeSeconds,
} = require('../services/operationalMetrics');
const { snapshotPassiveProviders } = require('../services/providerRequestTelemetry');
const { isOpenRouterConfigured } = require('../openRouterConfig');

async function checkDatabaseReady(connection) {
    try {
        if (isPostgresConnection(connection)) {
            await pingPostgresAsync(connection);
        } else {
            connection.database.prepare('SELECT 1').get();
        }
        return true;
    } catch {
        return false;
    }
}

function sessionSigningConfigured() {
    if (process.env.SESSION_SECRET?.trim() || process.env.JWT_SECRET?.trim()) return true;
    try {
        require('../sessionToken').signingKey();
        return true;
    } catch {
        return false;
    }
}

function essentialConfigChecks() {
    const { isFirebaseAdminConfigured } = require('../firebaseAdmin');
    return {
        sessionSigning: sessionSigningConfigured(),
        firebaseAdmin: isFirebaseAdminConfigured(),
        openrouter: isOpenRouterConfigured(),
        email: Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM),
        payments: Boolean(process.env.STRIPE_SECRET_KEY) || Boolean(
            process.env.WAYFORPAY_SECRET_KEY?.trim() && process.env.WAYFORPAY_MERCHANT_ACCOUNT?.trim(),
        ),
        monitoring: Boolean(process.env.SENTRY_DSN),
    };
}

async function buildReadinessPayload(connection) {
    const engine = connection.engine || getDatabaseEngine();
    const databaseReady = await checkDatabaseReady(connection);
    const checks = essentialConfigChecks();
    const ready = databaseReady && checks.sessionSigning;
    return {
        status: ready ? 'ready' : 'not_ready',
        service: 'allmodelai-backend',
        database: { engine, connected: databaseReady },
        checks,
        uptimeSeconds: uptimeSeconds(),
        timestamp: new Date().toISOString(),
    };
}

const getReady = async (req, res) => {
    const payload = await buildReadinessPayload(req.app.locals.db);
    const ok = payload.status === 'ready';
    return res.status(ok ? 200 : 503).json(payload);
};

const getOpsDashboard = async (req, res) => {
    const connection = req.app.locals.db;
    const readiness = await buildReadinessPayload(connection);
    const traffic = summarizeWindow(Number(process.env.OPS_METRICS_WINDOW_MS) || 15 * 60 * 1000);
    const providersConfigured = buildProviderSnapshot();
    let routerSummary = null;
    try {
        if (isPostgresConnection(connection)) {
            routerSummary = { engine: 'postgres', note: 'Query router_metrics in analytics warehouse' };
        } else {
            const row = connection.database.prepare(`
                SELECT COUNT(*) AS total,
                       SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS failures,
                       SUM(CASE WHEN fallback_used = 1 THEN 1 ELSE 0 END) AS fallbacks
                FROM router_metrics
                WHERE created_at > datetime('now', '-24 hours')
            `).get();
            routerSummary = {
                last24hRequests: row?.total || 0,
                failures: row?.failures || 0,
                fallbacks: row?.fallbacks || 0,
            };
        }
    } catch {
        routerSummary = null;
    }

    let activeSessions = null;
    try {
        if (isPostgresConnection(connection)) {
            activeSessions = await countActiveSessionsAsync(connection, Date.now());
        } else {
            activeSessions = connection.database.prepare(
                'SELECT COUNT(*) AS count FROM auth_sessions WHERE expires_at > ?',
            ).get(Date.now())?.count ?? 0;
        }
    } catch {
        activeSessions = null;
    }

    return res.json({
        updatedAt: new Date().toISOString(),
        readiness,
        traffic,
        activeSessions,
        providersConfigured,
        passiveProviderTelemetry: snapshotPassiveProviders(),
        routerSummary,
        alerts: recentAlerts(25),
        rateLimit: {
            productionChatPerMinute: 60,
            productionApiPerMinute: 300,
            note: 'Per-IP sliding window on /api in production',
        },
    });
};

const getOpsProviders = async (req, res) => {
    const probe = req.query.probe === '1';
    const snapshot = buildProviderSnapshot();
    const probed = probe ? await buildProviderHealth({ probe: true }) : snapshot;
    const enriched = {};
    Object.entries(probed).forEach(([id, row]) => {
        const passive = require('../services/providerRequestTelemetry').passiveStatusForProvider(id, row.configured);
        let availability = passive.availability;
        if (row.status === 'ok') availability = 'available';
        else if (row.status && row.status !== 'missing_configuration' && row.status !== 'configured') {
            availability = row.status === 'network_error' ? 'degraded' : 'unavailable';
        } else if (row.configured && availability === 'not_tested') {
            availability = 'configured';
        }
        enriched[id] = {
            ...row,
            availability,
            telemetrySource: passive.source,
            lastLatencyMs: passive.lastLatencyMs ?? null,
        };
    });
    return res.json({
        updatedAt: new Date().toISOString(),
        probe: Boolean(probe),
        providers: enriched,
    });
};

module.exports = {
    getReady,
    getOpsDashboard,
    getOpsProviders,
    buildReadinessPayload,
};
