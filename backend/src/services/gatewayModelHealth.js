'use strict';

/**
 * Tracks OpenRouter (and similar gateway) model IDs that recently failed with
 * non-retryable errors such as insufficient credits or invalid credentials.
 * Used by Anonin / Smart Router to avoid re-selecting known-bad models.
 */

const DEFAULT_TTL_MS = Number(process.env.GATEWAY_MODEL_HEALTH_TTL_MS) || 60 * 60 * 1000;

/** @type {Map<string, { reason: string, expiresAt: number, slug: string|null }>} */
const blockedModels = new Map();

/** @type {Map<string, { reason: string, expiresAt: number }>} */
const blockedSlugs = new Map();

function normalizeModelId(raw) {
    return String(raw || '').trim().toLowerCase();
}

function normalizeSlug(raw) {
    return String(raw || '').trim().toLowerCase();
}

function pruneExpired(now = Date.now()) {
    for (const [key, row] of blockedModels.entries()) {
        if (row.expiresAt <= now) blockedModels.delete(key);
    }
    for (const [key, row] of blockedSlugs.entries()) {
        if (row.expiresAt <= now) blockedSlugs.delete(key);
    }
}

/**
 * @param {object} opts
 * @param {string} [opts.gatewayModel]
 * @param {string} [opts.slug]
 * @param {string} [opts.reason]
 * @param {number} [opts.ttlMs]
 */
function markGatewayModelBlocked({
    gatewayModel = '',
    slug = '',
    reason = 'quota_exhausted',
    ttlMs = DEFAULT_TTL_MS,
} = {}) {
    const now = Date.now();
    pruneExpired(now);
    const expiresAt = now + Math.max(60_000, Number(ttlMs) || DEFAULT_TTL_MS);
    const modelId = normalizeModelId(gatewayModel);
    const slugKey = normalizeSlug(slug);
    if (modelId) {
        blockedModels.set(modelId, { reason: String(reason || 'unavailable'), expiresAt, slug: slugKey || null });
    }
    if (slugKey) {
        blockedSlugs.set(slugKey, { reason: String(reason || 'unavailable'), expiresAt });
    }
}

function isGatewayModelBlocked(gatewayModel) {
    pruneExpired();
    const modelId = normalizeModelId(gatewayModel);
    if (!modelId) return false;
    return blockedModels.has(modelId);
}

function isSlugBlockedByGatewayHealth(slug) {
    pruneExpired();
    const slugKey = normalizeSlug(slug);
    if (!slugKey) return false;
    return blockedSlugs.has(slugKey);
}

function getGatewayBlockReason(slugOrModel) {
    pruneExpired();
    const key = String(slugOrModel || '').trim().toLowerCase();
    return blockedSlugs.get(key)?.reason
        || blockedModels.get(key)?.reason
        || null;
}

function listBlockedGatewayModels() {
    pruneExpired();
    return [...blockedModels.entries()].map(([modelId, row]) => ({
        modelId,
        slug: row.slug,
        reason: row.reason,
        expiresAt: new Date(row.expiresAt).toISOString(),
    }));
}

function clearGatewayModelHealthForTests() {
    blockedModels.clear();
    blockedSlugs.clear();
}

module.exports = {
    markGatewayModelBlocked,
    isGatewayModelBlocked,
    isSlugBlockedByGatewayHealth,
    getGatewayBlockReason,
    listBlockedGatewayModels,
    clearGatewayModelHealthForTests,
};
