const { buildProviderHealthReport } = require('./providerHealthMonitor');
const { MODEL_CAPABILITIES, displayModelName } = require('./smartRouter2/capabilities');
const { buildProviderSnapshot } = require('../providerHealth');
const {
    fetchRouterMetricsSummaryAsync,
    fetchRouterMetricsBucketsAsync,
    fetchRecentProviderErrorEventsAsync,
} = require('./providerHealthPersistence');
const { getProviderTelemetryRow, passiveStatusForProvider } = require('./providerRequestTelemetry');
const { slugToProviderId } = require('./providerErrorClassification');

const WINDOW_MS = {
    '15m': 15 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
};

function parseWindow(raw) {
    const key = String(raw || '1h').trim().toLowerCase();
    return { key, ms: WINDOW_MS[key] || WINDOW_MS['1h'] };
}

const PUBLIC_STATUS_LABELS = {
    operational: 'Operational',
    degraded: 'Degraded',
    rate_limited: 'Rate Limited',
    quota_exhausted: 'Rate Limited',
    authentication_failed: 'Authentication Error',
    unavailable: 'Unavailable',
    not_configured: 'Not Configured',
    configured: 'Unknown',
    unknown: 'Unknown',
};

function statusExplanation(status, stale) {
    if (status === 'rate_limited' || status === 'quota_exhausted') {
        return 'Rate limit or quota reached. Requests may succeed after the provider resets your allowance.';
    }
    if (status === 'authentication_failed') {
        return 'Authentication failed. Administrator configuration requires attention.';
    }
    if (status === 'not_configured') {
        return 'This provider is not configured on the server.';
    }
    if (status === 'unknown' || status === 'configured') {
        return 'Not enough recent activity to determine provider health.';
    }
    if (stale) {
        return 'Last observation is stale; status may not reflect current availability.';
    }
    if (status === 'degraded') {
        return 'Elevated error rate or timeouts observed recently.';
    }
    if (status === 'unavailable') {
        return 'Persistent failures observed recently.';
    }
    return null;
}

function sanitizeProviderRow(row) {
    return {
        id: row.id,
        displayName: row.displayName || row.id,
        status: PUBLIC_STATUS_LABELS[row.status] || row.status,
        statusKey: row.status,
        configured: Boolean(row.configured),
        modelCount: row.modelCount ?? null,
        successRate: row.successRate,
        averageLatencyMs: row.averageLatencyMs,
        lastObservationAt: row.lastObservationAt,
        staleObservation: Boolean(row.staleObservation),
        explanation: statusExplanation(row.status, row.staleObservation),
        recentErrorCategories: Object.keys(row.recentErrorTypes || {}),
    };
}

function attachModelCounts(providers) {
    const byProvider = {};
    Object.entries(MODEL_CAPABILITIES).forEach(([slug, cap]) => {
        const pid = slugToProviderId(cap.provider) || cap.provider;
        byProvider[pid] = (byProvider[pid] || 0) + 1;
    });
    return providers.map((p) => ({
        ...p,
        modelCount: byProvider[p.id] || byProvider[slugToProviderId(p.id)] || 0,
    }));
}

async function buildAdminHealthReport(connection, { probe = false, window = '1h' } = {}) {
    const { ms } = parseWindow(window);
    const report = await buildProviderHealthReport(connection, { probe });
    const buckets = await fetchRouterMetricsBucketsAsync(connection, { windowMs: ms });
    const errorEvents = await fetchRecentProviderErrorEventsAsync(connection, { limit: 100 });
    const providers = attachModelCounts(report.providers);
    const models = await buildModelHealthRows(connection, { windowMs: ms });
    return {
        ...report,
        window,
        providers,
        models,
        charts: buildChartSeries(buckets, errorEvents),
        summary: buildSummary(providers, models),
    };
}

async function buildPublicHealthSummary(connection, { window = '1h' } = {}) {
    const admin = await buildAdminHealthReport(connection, { probe: false, window });
    return {
        updatedAt: admin.updatedAt,
        window: admin.window,
        summary: admin.summary,
        providers: admin.providers.map(sanitizeProviderRow),
        models: admin.models.map(sanitizeModelRow),
        charts: admin.charts,
        notes: admin.notes,
    };
}

function sanitizeModelRow(row) {
    return {
        id: row.id,
        displayName: row.displayName,
        providerId: row.providerId,
        status: PUBLIC_STATUS_LABELS[row.status] || row.status,
        statusKey: row.status,
        successRate: row.successRate,
        averageLatencyMs: row.averageLatencyMs,
        lastSuccessfulRequestAt: row.lastSuccessfulRequestAt,
        lastErrorCategory: row.lastErrorCategory,
        explanation: statusExplanation(row.status, row.staleObservation),
    };
}

async function buildModelHealthRows(connection, { windowMs = WINDOW_MS['1h'] } = {}) {
    const snapshot = buildProviderSnapshot();
    const routerByModel = await fetchRouterMetricsSummaryAsync(connection, windowMs, 'model');
    const rows = [];
    for (const [slug, cap] of Object.entries(MODEL_CAPABILITIES)) {
        const providerId = slugToProviderId(cap.provider) || String(cap.provider).toLowerCase();
        const configured = Boolean(snapshot[providerId]?.configured);
        const routerRow = routerByModel[slug] || routerByModel[cap.model] || null;
        const passive = passiveStatusForProvider(providerId, configured);
        let status = 'unknown';
        if (!configured) status = 'not_configured';
        else if (routerRow?.total >= 3) {
            const failRate = routerRow.failures / routerRow.total;
            if (failRate > 0.5) status = 'unavailable';
            else if (failRate > 0.15) status = 'degraded';
            else status = 'operational';
        } else if (passive.operationalStatus && passive.operationalStatus !== 'unknown') {
            status = passive.operationalStatus === 'available' ? 'operational' : passive.operationalStatus;
        } else if (configured) status = 'configured';

        const attempts = routerRow?.total || 0;
        const successes = attempts ? attempts - (routerRow.failures || 0) : 0;
        rows.push({
            id: slug,
            displayName: displayModelName(slug),
            providerId,
            configured,
            status,
            successRate: attempts ? Number((successes / attempts).toFixed(3)) : null,
            averageLatencyMs: routerRow?.avg_latency_ms ?? null,
            lastSuccessfulRequestAt: routerRow?.last_success_at || null,
            lastErrorCategory: routerRow?.last_error_category || null,
            requestCount: attempts,
            staleObservation: !routerRow?.last_at,
        });
    }
    return rows.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

function buildSummary(providers, models) {
    const statusCount = (list, key) => list.filter((r) => r.status === key).length;
    const configuredProviders = providers.filter((p) => p.configured);
    const latencies = providers
        .map((p) => p.averageLatencyMs)
        .filter((n) => typeof n === 'number' && n > 0);
    const rates = providers
        .map((p) => p.successRate)
        .filter((n) => typeof n === 'number');
    return {
        totalProviders: providers.length,
        configuredProviders: configuredProviders.length,
        operationalProviders: statusCount(providers, 'operational'),
        degradedProviders: statusCount(providers, 'degraded'),
        unavailableProviders: statusCount(providers, 'unavailable'),
        rateLimitedProviders: statusCount(providers, 'rate_limited') + statusCount(providers, 'quota_exhausted'),
        notConfiguredProviders: statusCount(providers, 'not_configured'),
        totalModels: models.length,
        averageLatencyMs: latencies.length
            ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
            : null,
        overallSuccessRate: rates.length
            ? Number((rates.reduce((a, b) => a + b, 0) / rates.length).toFixed(3))
            : null,
    };
}

function buildChartSeries(buckets, errorEvents) {
    const successRateOverTime = (buckets || []).map((b) => ({
        t: b.bucketStart,
        successRate: b.total ? Number(((b.total - b.failures) / b.total).toFixed(3)) : null,
        volume: b.total,
    }));
    const latencyOverTime = (buckets || []).map((b) => ({
        t: b.bucketStart,
        avgLatencyMs: b.avg_latency_ms ?? null,
    }));
    const errorsByCategory = {};
    for (const event of errorEvents || []) {
        const cat = event.error_class || 'unknown';
        errorsByCategory[cat] = (errorsByCategory[cat] || 0) + 1;
    }
    const volumeByProvider = {};
    for (const b of buckets || []) {
        const pid = String(b.provider || 'unknown').toLowerCase();
        volumeByProvider[pid] = (volumeByProvider[pid] || 0) + (b.total || 0);
    }
    return {
        successRateOverTime,
        latencyOverTime,
        errorsByCategory,
        volumeByProvider,
    };
}

function filterProviders(providers, { statusFilter, search }) {
    let list = [...providers];
    const sf = String(statusFilter || 'all').toLowerCase();
    if (sf !== 'all') {
        const map = {
            operational: ['operational'],
            degraded: ['degraded'],
            unavailable: ['unavailable'],
            'rate limited': ['rate_limited', 'quota_exhausted'],
            'not configured': ['not_configured'],
        };
        const keys = map[sf] || [sf.replace(/\s+/g, '_')];
        list = list.filter((p) => keys.includes(p.statusKey || p.status));
    }
    const q = String(search || '').trim().toLowerCase();
    if (q) {
        list = list.filter((p) => p.id.includes(q) || String(p.displayName || '').toLowerCase().includes(q));
    }
    return list;
}

function sortProviders(providers, sortBy) {
    const key = String(sortBy || 'name').toLowerCase();
    const copy = [...providers];
    if (key === 'latency') {
        copy.sort((a, b) => (a.averageLatencyMs ?? 1e9) - (b.averageLatencyMs ?? 1e9));
    } else if (key === 'success') {
        copy.sort((a, b) => (b.successRate ?? -1) - (a.successRate ?? -1));
    } else {
        copy.sort((a, b) => String(a.displayName || a.id).localeCompare(String(b.displayName || b.id)));
    }
    return copy;
}

module.exports = {
    parseWindow,
    buildAdminHealthReport,
    buildPublicHealthSummary,
    buildModelHealthRows,
    buildSummary,
    filterProviders,
    sortProviders,
    sanitizeProviderRow,
    sanitizeModelRow,
    PUBLIC_STATUS_LABELS,
};
