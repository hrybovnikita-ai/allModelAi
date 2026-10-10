const WINDOW_MS = 60 * 60 * 1000;
const MAX_EVENTS = 2000;

/** @type {Map<string, { successes: number, failures: number, rateLimited: number, lastAt: number, lastLatencyMs: number, lastError: string|null }>} */
const byProvider = new Map();

function normalizeProviderId(raw) {
    const id = String(raw || '').trim().toLowerCase();
    if (!id) return 'unknown';
    if (id === 'open_ai' || id === 'chatgpt') return 'openai';
    if (id === 'anthropic') return 'claude';
    if (id === 'google') return 'gemini';
    if (id === 'xai') return 'grok';
    return id;
}

function classifyErrorCategory(category) {
    const c = String(category || '').toLowerCase();
    if (c.includes('rate') || c.includes('429')) return 'rate_limited';
    if (c.includes('timeout')) return 'degraded';
    if (c.includes('auth') || c.includes('401') || c.includes('403')) return 'unavailable';
    if (c) return 'degraded';
    return 'unavailable';
}

function recordProviderRequest({
    provider,
    success = true,
    latencyMs = 0,
    errorCategory = null,
    fallbackUsed = false,
}) {
    const id = normalizeProviderId(provider);
    const row = byProvider.get(id) || {
        successes: 0,
        failures: 0,
        rateLimited: 0,
        lastAt: 0,
        lastLatencyMs: 0,
        lastError: null,
    };
    row.lastAt = Date.now();
    row.lastLatencyMs = Math.max(0, Math.round(Number(latencyMs) || 0));
    if (success) {
        row.successes += 1;
        row.lastError = null;
    } else {
        row.failures += 1;
        const bucket = classifyErrorCategory(errorCategory);
        if (bucket === 'rate_limited') row.rateLimited += 1;
        row.lastError = bucket;
    }
    if (fallbackUsed) row.lastError = row.lastError || 'degraded';
    byProvider.set(id, row);

    // Trim stale providers
    const cutoff = Date.now() - WINDOW_MS;
    for (const [key, value] of byProvider.entries()) {
        if (value.lastAt < cutoff) byProvider.delete(key);
    }

    // Cap total tracked keys
    if (byProvider.size > MAX_EVENTS) {
        const oldest = [...byProvider.entries()].sort((a, b) => a[1].lastAt - b[1].lastAt)[0]?.[0];
        if (oldest) byProvider.delete(oldest);
    }
}

function passiveStatusForProvider(providerId, configured) {
    if (!configured) {
        return { availability: 'not_configured', source: 'config' };
    }
    const row = byProvider.get(normalizeProviderId(providerId));
    if (!row || Date.now() - row.lastAt > WINDOW_MS) {
        return { availability: 'not_tested', source: 'passive' };
    }
    const attempts = row.successes + row.failures;
    if (!attempts) return { availability: 'not_tested', source: 'passive' };
    if (row.rateLimited > 0 && row.rateLimited >= row.failures) {
        return { availability: 'rate_limited', source: 'passive', lastLatencyMs: row.lastLatencyMs };
    }
    const failRate = row.failures / attempts;
    if (failRate > 0.5) {
        return { availability: 'unavailable', source: 'passive', lastLatencyMs: row.lastLatencyMs };
    }
    if (failRate > 0.15 || row.lastError === 'degraded') {
        return { availability: 'degraded', source: 'passive', lastLatencyMs: row.lastLatencyMs };
    }
    return { availability: 'available', source: 'passive', lastLatencyMs: row.lastLatencyMs };
}

function snapshotPassiveProviders() {
    const out = {};
    for (const [id, row] of byProvider.entries()) {
        out[id] = {
            successes: row.successes,
            failures: row.failures,
            rateLimited: row.rateLimited,
            lastAt: new Date(row.lastAt).toISOString(),
            lastLatencyMs: row.lastLatencyMs,
        };
    }
    return out;
}

function resetForTests() {
    byProvider.clear();
}

module.exports = {
    recordProviderRequest,
    passiveStatusForProvider,
    snapshotPassiveProviders,
    resetForTests,
};
