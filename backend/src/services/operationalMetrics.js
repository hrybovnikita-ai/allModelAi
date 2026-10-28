const MAX_SAMPLES = 4000;
const MAX_ALERTS = 80;
const startedAt = Date.now();

/** @type {Array<{ at: number, method: string, route: string, status: number, durationMs: number, responseBytes: number, outcome: string }>} */
const samples = [];

const STATUS_BUCKETS = [200, 400, 401, 402, 429, 500];

/** @type {Array<{ at: string, level: string, category: string, message: string }>} */
const alerts = [];

function normalizeRoute(path) {
    const raw = String(path || '').split('?')[0] || '/';
    return raw
        .replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '/:id')
        .replace(/\/\d+/g, '/:id')
        .slice(0, 120);
}

function outcomeFromStatus(status) {
    if (status >= 500) return 'server_error';
    if (status >= 400) return 'client_error';
    return 'ok';
}

function recordHttpRequest({ method, path, statusCode, durationMs, responseBytes = 0 }) {
    const status = Number(statusCode) || 0;
    const entry = {
        at: Date.now(),
        method: String(method || 'GET').toUpperCase(),
        route: normalizeRoute(path),
        status,
        durationMs: Math.max(0, Math.round(Number(durationMs) || 0)),
        responseBytes: Math.max(0, Math.round(Number(responseBytes) || 0)),
        outcome: outcomeFromStatus(status),
    };
    samples.push(entry);
    if (samples.length > MAX_SAMPLES) samples.splice(0, samples.length - MAX_SAMPLES);
    if (status >= 500) {
        pushAlert('error', 'http_5xx', `${entry.method} ${entry.route} → ${status}`);
    }
}

function pushAlert(level, category, message) {
    alerts.unshift({
        at: new Date().toISOString(),
        level,
        category,
        message: String(message || '').slice(0, 240),
    });
    if (alerts.length > MAX_ALERTS) alerts.length = MAX_ALERTS;
}

function percentile(values, p) {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
    return sorted[Math.max(0, idx)];
}

function countStatusBucket(status) {
    if (status >= 500) return 500;
    if (status === 429) return 429;
    if (status === 402) return 402;
    if (status === 401) return 401;
    if (status >= 400) return 400;
    return 200;
}

function buildRpmSeries(windowSamples, windowMs) {
    const bucketMs = 60_000;
    const buckets = Math.max(1, Math.ceil(windowMs / bucketMs));
    const now = Date.now();
    const series = [];
    for (let i = buckets - 1; i >= 0; i -= 1) {
        const end = now - i * bucketMs;
        const start = end - bucketMs;
        const count = windowSamples.filter((s) => s.at >= start && s.at < end).length;
        series.push({
            minuteOffset: i,
            requestsPerMinute: count,
            at: new Date(end).toISOString(),
        });
    }
    return series;
}

function summarizeWindow(windowMs = 15 * 60 * 1000) {
    const since = Date.now() - windowMs;
    const windowSamples = samples.filter((s) => s.at >= since);
    const durations = windowSamples.map((s) => s.durationMs);
    const total = windowSamples.length;
    const errors5xx = windowSamples.filter((s) => s.status >= 500).length;
    const errors4xx = windowSamples.filter((s) => s.status >= 400 && s.status < 500).length;
    const statusCounts = Object.fromEntries(STATUS_BUCKETS.map((code) => [code, 0]));
    windowSamples.forEach((s) => {
        const bucket = countStatusBucket(s.status);
        statusCounts[bucket] = (statusCounts[bucket] || 0) + 1;
    });
    const totalResponseBytes = windowSamples.reduce((sum, s) => sum + (s.responseBytes || 0), 0);
    const byRoute = new Map();
    windowSamples.forEach((s) => {
        const key = `${s.method} ${s.route}`;
        const row = byRoute.get(key) || {
            route: key,
            count: 0,
            errors: 0,
            totalMs: 0,
            totalBytes: 0,
        };
        row.count += 1;
        row.totalMs += s.durationMs;
        row.totalBytes += s.responseBytes || 0;
        if (s.status >= 400) row.errors += 1;
        byRoute.set(key, row);
    });
    const topRoutes = [...byRoute.values()]
        .sort((a, b) => b.count - a.count)
        .slice(0, 12)
        .map((row) => ({
            route: row.route,
            count: row.count,
            errors: row.errors,
            avgLatencyMs: row.count ? Math.round(row.totalMs / row.count) : 0,
            avgResponseBytes: row.count ? Math.round(row.totalBytes / row.count) : 0,
        }));
    const failingRoutes = [...byRoute.values()]
        .filter((row) => row.errors > 0)
        .sort((a, b) => b.errors - a.errors || b.count - a.count)
        .slice(0, 10)
        .map((row) => ({
            route: row.route,
            errors: row.errors,
            count: row.count,
            errorRate: row.count ? Number((row.errors / row.count).toFixed(4)) : 0,
        }));

    return {
        windowMinutes: Math.round(windowMs / 60000),
        requestCount: total,
        requestsPerMinute: windowMs >= 60_000
            ? Number((total / (windowMs / 60_000)).toFixed(2))
            : total,
        avgLatencyMs: total ? Math.round(durations.reduce((a, b) => a + b, 0) / total) : 0,
        p95LatencyMs: percentile(durations, 95),
        p99LatencyMs: percentile(durations, 99),
        http4xx: errors4xx,
        http5xx: errors5xx,
        statusCounts,
        estimatedResponseMegabytes: Number((totalResponseBytes / (1024 * 1024)).toFixed(4)),
        errorRate: total ? Number(((errors4xx + errors5xx) / total).toFixed(4)) : 0,
        topRoutes,
        failingRoutes,
        rpmSeries: buildRpmSeries(windowSamples, windowMs),
    };
}

function summarizeApiPerformance(windowMs = 15 * 60 * 1000) {
    return summarizeWindow(windowMs);
}

function recentAlerts(limit = 20) {
    return alerts.slice(0, limit);
}

function uptimeSeconds() {
    return Math.floor((Date.now() - startedAt) / 1000);
}

function resetForTests() {
    samples.length = 0;
    alerts.length = 0;
}

module.exports = {
    recordHttpRequest,
    pushAlert,
    summarizeWindow,
    summarizeApiPerformance,
    recentAlerts,
    uptimeSeconds,
    resetForTests,
};
