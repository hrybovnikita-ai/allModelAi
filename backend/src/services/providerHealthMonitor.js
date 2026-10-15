const { buildProviderSnapshot, buildProviderHealth } = require('../providerHealth');
const {
    passiveStatusForProvider,
    snapshotPassiveProviders,
    getProviderTelemetryRow,
} = require('./providerRequestTelemetry');
const { classifyProviderError, slugToProviderId } = require('./providerErrorClassification');
const {
    fetchRecentProviderErrorEventsAsync,
    fetchRouterMetricsSummaryAsync,
} = require('./providerHealthPersistence');

const STALE_MS = Number(process.env.PROVIDER_HEALTH_STALE_MS) || 60 * 60 * 1000;

function probesEnabled() {
    return String(process.env.ENABLE_PROVIDER_HEALTH_PROBES || '').trim() === '1';
}

function mapProbeStatusToOperational(probeStatus) {
    if (!probeStatus || probeStatus === 'configured' || probeStatus === 'missing_configuration') {
        return null;
    }
    if (probeStatus === 'ok') return 'operational';
    if (probeStatus === 'authentication_failed') return 'authentication_failed';
    if (probeStatus === 'network_error') return 'degraded';
    if (probeStatus === 'wrong_model') return 'degraded';
    return 'unavailable';
}

function mergeOperationalStatus({
    configured,
    passive,
    probeOperational,
    routerRow,
}) {
    if (!configured) return { status: 'not_configured', source: 'config' };

    const passiveStatus = passive?.operationalStatus || passive?.availability;
    const hasPassive = passive?.source === 'passive'
        && passiveStatus
        && !['not_tested', 'unknown'].includes(passiveStatus);

    if (probeOperational === 'authentication_failed') {
        return { status: 'authentication_failed', source: 'probe' };
    }

    if (hasPassive) {
        const statusMap = {
            available: 'operational',
            operational: 'operational',
            degraded: 'degraded',
            rate_limited: 'rate_limited',
            quota_exhausted: 'quota_exhausted',
            authentication_failed: 'authentication_failed',
            unavailable: 'unavailable',
            unknown: 'unknown',
            configured: 'configured',
        };
        return {
            status: statusMap[passiveStatus] || passiveStatus,
            source: 'passive',
        };
    }

    if (probeOperational) {
        return { status: probeOperational, source: 'probe' };
    }

    if (routerRow?.total >= 3) {
        const failRate = routerRow.failures / routerRow.total;
        if (failRate > 0.5) return { status: 'unavailable', source: 'router_metrics' };
        if (failRate > 0.15) return { status: 'degraded', source: 'router_metrics' };
        return { status: 'operational', source: 'router_metrics' };
    }

    return { status: 'configured', source: 'config' };
}

function buildProviderHealthRow(id, context) {
    const { snapshotRow, passive, probeOperational, routerRow, telemetryRow } = context;
    const configured = Boolean(snapshotRow?.configured);
    const merged = mergeOperationalStatus({
        configured,
        passive,
        probeOperational,
        routerRow,
    });

    const attempts = telemetryRow
        ? telemetryRow.successes + telemetryRow.failures
        : routerRow?.total || 0;
    const successes = telemetryRow?.successes
        ?? (routerRow ? routerRow.total - routerRow.failures : 0);
    const successRate = attempts > 0 ? Number((successes / attempts).toFixed(3)) : null;

    const lastObservedAt = telemetryRow?.lastAt
        ? new Date(telemetryRow.lastAt).toISOString()
        : routerRow?.last_at || null;
    const stale = lastObservedAt
        ? Date.now() - new Date(lastObservedAt).getTime() > STALE_MS
        : merged.source === 'config';

    let circuitBreaker = null;
    try {
        circuitBreaker = require('./providerCircuitBreaker').snapshot(id);
    } catch {
        circuitBreaker = null;
    }

    return {
        id,
        displayName: id,
        configured,
        model: snapshotRow?.model || null,
        status: merged.status,
        statusSource: merged.source,
        staleObservation: stale && merged.status !== 'not_configured',
        successRate,
        averageLatencyMs: telemetryRow?.avgLatencyMs ?? routerRow?.avg_latency_ms ?? null,
        lastObservationAt: lastObservedAt,
        lastSuccessfulRequestAt: telemetryRow?.lastSuccessAt
            ? new Date(telemetryRow.lastSuccessAt).toISOString()
            : null,
        lastHealthCheckAt: probeOperational ? context.probeCheckedAt : null,
        recentErrorTypes: telemetryRow?.errorTypeCounts || {},
        recentIncidents: (telemetryRow?.incidents || []).slice(0, 5),
        probeStatus: snapshotRow?.status || null,
        circuitBreaker,
        automaticRecovery: circuitBreaker?.state === 'open'
            ? 'waiting_for_half_open'
            : circuitBreaker?.state === 'half_open'
                ? 'probing'
                : 'ready',
    };
}

async function buildProviderHealthReport(connection, { probe = false } = {}) {
    const runProbe = probe && probesEnabled();
    const snapshot = runProbe
        ? await buildProviderHealth({ probe: true })
        : buildProviderSnapshot();
    const passiveMap = snapshotPassiveProviders();
    const routerSummary = await fetchRouterMetricsSummaryAsync(connection);
    const errorEvents = await fetchRecentProviderErrorEventsAsync(connection, { limit: 50 });

    const providers = {};
    const probeCheckedAt = runProbe ? new Date().toISOString() : null;

    for (const [id, row] of Object.entries(snapshot)) {
        const passive = passiveStatusForProvider(id, row.configured);
        const probeOperational = runProbe ? mapProbeStatusToOperational(row.status) : null;
        const telemetryRow = getProviderTelemetryRow(id);
        const routerKey = id;
        const routerRow = routerSummary[routerKey] || routerSummary[slugToProviderId(id)] || null;

        providers[id] = buildProviderHealthRow(id, {
            snapshotRow: row,
            passive,
            probeOperational,
            routerRow,
            telemetryRow,
            probeCheckedAt,
        });
    }

    const incidentsByProvider = {};
    for (const event of errorEvents) {
        const pid = String(event.provider_id || '').toLowerCase();
        if (!incidentsByProvider[pid]) incidentsByProvider[pid] = [];
        if (incidentsByProvider[pid].length < 5) {
            incidentsByProvider[pid].push({
                errorClass: event.error_class,
                httpStatus: event.http_status,
                hint: event.sanitized_hint,
                at: event.created_at,
            });
        }
    }
    Object.entries(incidentsByProvider).forEach(([pid, list]) => {
        if (providers[pid]) {
            providers[pid].persistedIncidents = list;
        }
    });

    return {
        updatedAt: new Date().toISOString(),
        probeRequested: Boolean(probe),
        probeExecuted: runProbe,
        probesEnabled: probesEnabled(),
        passiveTelemetry: passiveMap,
        providers: Object.values(providers).sort((a, b) => a.id.localeCompare(b.id)),
        notes: [
            'Operational status requires recent successful traffic or an enabled probe — API keys alone show as configured.',
            'Active probes run only when ENABLE_PROVIDER_HEALTH_PROBES=1 and probe=1 is requested.',
        ],
    };
}

module.exports = {
    buildProviderHealthReport,
    probesEnabled,
    mergeOperationalStatus,
    slugToProviderId,
    classifyProviderError,
};
