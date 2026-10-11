const { classifyProviderError } = require('./providerErrorClassification');

const WINDOW_MS = 60 * 60 * 1000;
const MAX_EVENTS = 2000;
const MAX_INCIDENTS = 12;

/** @type {Map<string, ProviderTelemetryRow>} */
const byProvider = new Map();

/**
 * @typedef {object} ProviderTelemetryRow
 * @property {number} successes
 * @property {number} failures
 * @property {number} rateLimited
 * @property {number} lastAt
 * @property {number} lastSuccessAt
 * @property {number} lastLatencyMs
 * @property {number} latencySum
 * @property {number} latencyCount
 * @property {number} avgLatencyMs
 * @property {string|null} lastError
 * @property {Record<string, number>} errorTypeCounts
 * @property {Array<{ at: string, errorClass: string, httpStatus: number|null }>} incidents
 */

function normalizeProviderId(raw) {
    const id = String(raw || '').trim().toLowerCase();
    if (!id) return 'unknown';
    if (id === 'open_ai' || id === 'chatgpt' || id === 'gpt') return 'openai';
    if (id === 'anthropic') return 'claude';
    if (id === 'google') return 'gemini';
    if (id === 'xai') return 'grok';
    return id;
}

function resolveErrorClass({ errorCategory, httpStatus, message, timedOut }) {
    if (errorCategory && !/^\d+$/.test(String(errorCategory))) {
        const known = String(errorCategory).toLowerCase();
        if (known.includes('timeout')) return 'timeout';
        if (known.includes('auth')) return 'authentication_failed';
        if (known.includes('rate')) return 'rate_limited';
        if (known.includes('quota') || known.includes('billing')) return 'quota_exhausted';
        return known.slice(0, 64);
    }
    return classifyProviderError({
        httpStatus,
        message,
        timedOut,
        billingHint: /billing|quota|credit|balance/i.test(String(message || '')),
    }).errorClass;
}

function recordProviderRequest({
    provider,
    success = true,
    latencyMs = 0,
    errorCategory = null,
    httpStatus = null,
    message = null,
    timedOut = false,
    fallbackUsed = false,
}) {
    const id = normalizeProviderId(provider);
    /** @type {ProviderTelemetryRow} */
    const row = byProvider.get(id) || {
        successes: 0,
        failures: 0,
        rateLimited: 0,
        lastAt: 0,
        lastSuccessAt: 0,
        lastLatencyMs: 0,
        latencySum: 0,
        latencyCount: 0,
        avgLatencyMs: 0,
        lastError: null,
        errorTypeCounts: {},
        incidents: [],
    };
    const now = Date.now();
    row.lastAt = now;
    const latency = Math.max(0, Math.round(Number(latencyMs) || 0));
    row.lastLatencyMs = latency;
    if (latency > 0) {
        row.latencySum += latency;
        row.latencyCount += 1;
        row.avgLatencyMs = Math.round(row.latencySum / row.latencyCount);
    }

    if (success) {
        row.successes += 1;
        row.lastSuccessAt = now;
        row.lastError = null;
    } else {
        row.failures += 1;
        const errorClass = resolveErrorClass({ errorCategory, httpStatus, message, timedOut });
        row.lastError = errorClass;
        row.errorTypeCounts[errorClass] = (row.errorTypeCounts[errorClass] || 0) + 1;
        if (errorClass === 'rate_limited') row.rateLimited += 1;
        if (errorClass === 'quota_exhausted') row.rateLimited += 1;
        row.incidents.unshift({
            at: new Date(now).toISOString(),
            errorClass,
            httpStatus: httpStatus == null ? null : Number(httpStatus) || null,
        });
        row.incidents = row.incidents.slice(0, MAX_INCIDENTS);
        if (fallbackUsed && !row.errorTypeCounts.degraded_fallback) {
            row.errorTypeCounts.degraded_fallback = 1;
        }
    }
    byProvider.set(id, row);

    const cutoff = Date.now() - WINDOW_MS;
    for (const [key, value] of byProvider.entries()) {
        if (value.lastAt < cutoff) byProvider.delete(key);
    }

    if (byProvider.size > MAX_EVENTS) {
        const oldest = [...byProvider.entries()].sort((a, b) => a[1].lastAt - b[1].lastAt)[0]?.[0];
        if (oldest) byProvider.delete(oldest);
    }

    return { providerId: id, errorClass: success ? null : row.lastError };
}

function passiveOperationalStatus(providerId, configured, row) {
    if (!configured) {
        return { operationalStatus: 'not_configured', availability: 'not_configured', source: 'config' };
    }
    if (!row || Date.now() - row.lastAt > WINDOW_MS) {
        return { operationalStatus: 'unknown', availability: 'not_tested', source: 'passive' };
    }
    const attempts = row.successes + row.failures;
    if (!attempts) {
        return { operationalStatus: 'unknown', availability: 'not_tested', source: 'passive' };
    }

    const lastClass = row.lastError;
    if (lastClass === 'authentication_failed') {
        return {
            operationalStatus: 'authentication_failed',
            availability: 'authentication_failed',
            source: 'passive',
            lastLatencyMs: row.lastLatencyMs,
        };
    }
    if (lastClass === 'quota_exhausted') {
        return {
            operationalStatus: 'quota_exhausted',
            availability: 'quota_exhausted',
            source: 'passive',
            lastLatencyMs: row.lastLatencyMs,
        };
    }
    if (row.rateLimited > 0 && row.rateLimited >= Math.max(1, Math.floor(row.failures * 0.5))) {
        return {
            operationalStatus: 'rate_limited',
            availability: 'rate_limited',
            source: 'passive',
            lastLatencyMs: row.lastLatencyMs,
        };
    }

    const failRate = row.failures / attempts;
    if (failRate > 0.5) {
        return {
            operationalStatus: 'unavailable',
            availability: 'unavailable',
            source: 'passive',
            lastLatencyMs: row.lastLatencyMs,
        };
    }
    if (failRate > 0.15 || ['degraded', 'timeout', 'server_error', 'network_error', 'invalid_request'].includes(lastClass)) {
        return {
            operationalStatus: 'degraded',
            availability: 'degraded',
            source: 'passive',
            lastLatencyMs: row.lastLatencyMs,
        };
    }
    return {
        operationalStatus: 'operational',
        availability: 'available',
        source: 'passive',
        lastLatencyMs: row.lastLatencyMs,
    };
}

function passiveStatusForProvider(providerId, configured) {
    const status = passiveOperationalStatus(providerId, configured, byProvider.get(normalizeProviderId(providerId)));
    return status;
}

function getProviderTelemetryRow(providerId) {
    return byProvider.get(normalizeProviderId(providerId)) || null;
}

function snapshotPassiveProviders() {
    const out = {};
    for (const [id, row] of byProvider.entries()) {
        out[id] = {
            successes: row.successes,
            failures: row.failures,
            rateLimited: row.rateLimited,
            lastAt: new Date(row.lastAt).toISOString(),
            lastSuccessAt: row.lastSuccessAt ? new Date(row.lastSuccessAt).toISOString() : null,
            lastLatencyMs: row.lastLatencyMs,
            avgLatencyMs: row.avgLatencyMs,
            errorTypeCounts: { ...row.errorTypeCounts },
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
    getProviderTelemetryRow,
    resetForTests,
    normalizeProviderId,
};
