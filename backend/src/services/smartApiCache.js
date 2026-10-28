/**
 * User-scoped safe GET cache + in-flight request deduplication (per process).
 * Never use for chat message bodies or cross-user payloads.
 */

const DEFAULT_TTL_SEC = Number(process.env.SMART_CACHE_TTL_SEC || 45);
const MAX_ENTRIES = Number(process.env.SMART_CACHE_MAX_ENTRIES || 200);

/** @type {Map<string, { expires: number, value: unknown }>} */
const memoryCache = new Map();
/** @type {Map<string, Promise<unknown>>} */
const inflight = new Map();

function hashEmail(email) {
    const crypto = require('node:crypto');
    return crypto.createHash('sha256').update(String(email || '').trim().toLowerCase()).digest('hex').slice(0, 16);
}

function buildUserScopedKey(email, routeKey) {
    return `smartcache:${hashEmail(email)}:${routeKey}`;
}

function pruneIfNeeded() {
    if (memoryCache.size <= MAX_ENTRIES) return;
    const oldest = memoryCache.keys().next().value;
    if (oldest) memoryCache.delete(oldest);
}

function getCachedUserResponse(email, routeKey) {
    const key = buildUserScopedKey(email, routeKey);
    const row = memoryCache.get(key);
    if (!row || row.expires <= Date.now()) {
        memoryCache.delete(key);
        return null;
    }
    return row.value;
}

function setCachedUserResponse(email, routeKey, value, ttlSec = DEFAULT_TTL_SEC) {
    const key = buildUserScopedKey(email, routeKey);
    pruneIfNeeded();
    memoryCache.set(key, {
        expires: Date.now() + Math.max(1, ttlSec) * 1000,
        value,
    });
}

function invalidateUserCache(email) {
    const prefix = `smartcache:${hashEmail(email)}:`;
    for (const key of memoryCache.keys()) {
        if (key.startsWith(prefix)) memoryCache.delete(key);
    }
}

async function dedupeInFlight(key, factory) {
    const cacheKey = String(key);
    if (inflight.has(cacheKey)) return inflight.get(cacheKey);
    const run = (async () => factory())();
    inflight.set(cacheKey, run);
    try {
        return await run;
    } finally {
        if (inflight.get(cacheKey) === run) inflight.delete(cacheKey);
    }
}

function cacheStats() {
    return {
        entries: memoryCache.size,
        inflight: inflight.size,
        maxEntries: MAX_ENTRIES,
        defaultTtlSec: DEFAULT_TTL_SEC,
    };
}

function resetForTests() {
    memoryCache.clear();
    inflight.clear();
}

module.exports = {
    buildUserScopedKey,
    getCachedUserResponse,
    setCachedUserResponse,
    invalidateUserCache,
    dedupeInFlight,
    cacheStats,
    resetForTests,
};
