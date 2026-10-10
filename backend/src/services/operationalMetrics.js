const MAX_SAMPLES = 4000;
const MAX_ALERTS = 80;
const startedAt = Date.now();

/** @type {Array<{ at: number, method: string, route: string, status: number, durationMs: number, outcome: string }>} */
const samples = [];

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

function recordHttpRequest({ method, path, statusCode, durationMs }) {
    const status = Number(statusCode) || 0;
    const entry = {
        at: Date.now(),
        method: String(method || 'GET').toUpperCase(),
        route: normalizeRoute(path),
        status,
        durationMs: Math.max(0, Math.round(Number(durationMs) || 0)),
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

function summarizeWindow(windowMs = 15 * 60 * 1000) {
    const since = Date.now() - windowMs;
    const windowSamples = samples.filter((s) => s.at >= since);
    const durations = windowSamples.map((s) => s.durationMs);
    const total = windowSamples.length;
    const errors5xx = windowSamples.filter((s) => s.status >= 500).length;
    const errors4xx = windowSamples.filter((s) => s.status >= 400 && s.status < 500).length;
    const byRoute = new Map();
    windowSamples.forEach((s) => {
        const key = `${s.method} ${s.route}`;
        const row = byRoute.get(key) || { route: key, count: 0, errors: 0, totalMs: 0 };
        row.count += 1;
        row.totalMs += s.durationMs;
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
        }));

    return {
        windowMinutes: Math.round(windowMs / 60000),
        requestCount: total,
        avgLatencyMs: total ? Math.round(durations.reduce((a, b) => a + b, 0) / total) : 0,
        p95LatencyMs: percentile(durations, 95),
        http4xx: errors4xx,
        http5xx: errors5xx,
        errorRate: total ? Number(((errors4xx + errors5xx) / total).toFixed(4)) : 0,
        topRoutes,
    };
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
    recentAlerts,
    uptimeSeconds,
    resetForTests,
};
