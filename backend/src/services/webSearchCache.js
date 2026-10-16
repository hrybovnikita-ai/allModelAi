'use strict';

/** In-memory result cache with freshness TTL. No secrets stored. */
const DEFAULT_TTL_MS = Math.min(
    Math.max(Number(process.env.WEB_SEARCH_CACHE_TTL_MS) || 5 * 60 * 1000, 30_000),
    30 * 60 * 1000,
);
const MAX_ENTRIES = 80;

const store = new Map();

function cacheKey(parts) {
    return JSON.stringify(parts);
}

function getCached(key) {
    const hit = store.get(key);
    if (!hit) return null;
    if (Date.now() > hit.expiresAt) {
        store.delete(key);
        return null;
    }
    return hit.value;
}

function setCached(key, value, ttlMs = DEFAULT_TTL_MS) {
    if (store.size >= MAX_ENTRIES) {
        const oldest = store.keys().next().value;
        if (oldest != null) store.delete(oldest);
    }
    store.set(key, {
        expiresAt: Date.now() + ttlMs,
        value,
    });
}

function clearWebSearchCache() {
    store.clear();
}

module.exports = {
    DEFAULT_TTL_MS,
    cacheKey,
    getCached,
    setCached,
    clearWebSearchCache,
};
