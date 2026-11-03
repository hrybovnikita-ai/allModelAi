'use strict';

/**
 * Tracks OpenRouter (and similar gateway) model IDs that recently failed with
 * non-retryable errors such as insufficient credits or invalid credentials.
 * Used by Anonin / Smart Router to avoid re-selecting known-bad models.
 */

const DEFAULT_TTL_MS = Number(process.env.GATEWAY_MODEL_HEALTH_TTL_MS) || 60 * 60 * 1000;
const RATE_LIMIT_COOLDOWN_MS = Number(process.env.GATEWAY_RATE_LIMIT_COOLDOWN_MS) || 120_000;
const DEGRADED_COOLDOWN_MS = Number(process.env.GATEWAY_DEGRADED_COOLDOWN_MS) || 180_000;

function ttlMsForReason(reason = '') {
    const key = String(reason || '').trim().toLowerCase();
    if (key === 'rate_limited') return RATE_LIMIT_COOLDOWN_MS;
    if (key === 'degraded' || key === 'temporarily_unavailable') return DEGRADED_COOLDOWN_MS;
    return DEFAULT_TTL_MS;
}

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
    ttlMs,
    blockSlug = true,
} = {}) {
    const now = Date.now();
    pruneExpired(now);
    const resolvedTtl = Number.isFinite(Number(ttlMs)) && Number(ttlMs) > 0
        ? Number(ttlMs)
        : ttlMsForReason(reason);
    const expiresAt = now + Math.max(30_000, resolvedTtl);
    const modelId = normalizeModelId(gatewayModel);
    const slugKey = normalizeSlug(slug);
    if (modelId) {
        blockedModels.set(modelId, { reason: String(reason || 'unavailable'), expiresAt, slug: slugKey || null });
    }
    if (blockSlug && slugKey) {
        blockedSlugs.set(slugKey, { reason: String(reason || 'unavailable'), expiresAt });
    }
}

function isGatewayModelBlocked(gatewayModel) {
    pruneExpired();
    const modelId = normalizeModelId(gatewayModel);
    if (!modelId) return false;
    return blockedModels.has(modelId);
}

function getGatewayModelBlock(gatewayModel) {
    pruneExpired();
    const modelId = normalizeModelId(gatewayModel);
    if (!modelId) return null;
    const row = blockedModels.get(modelId);
    if (!row) return null;
    return {
        modelId,
        reason: row.reason,
        expiresAt: row.expiresAt,
        slug: row.slug,
        temporary: row.reason === 'rate_limited' || row.reason === 'degraded' || row.reason === 'temporarily_unavailable',
    };
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

function markOpenRouterCreditsExhausted({ ttlMs = DEFAULT_TTL_MS } = {}) {
    markGatewayModelBlocked({
        slug: 'openrouter',
        gatewayModel: 'openrouter',
        reason: 'quota_exhausted',
        ttlMs,
        blockSlug: true,
    });
}

function isOpenRouterCreditsExhausted() {
    pruneExpired();
    return isSlugBlockedByGatewayHealth('openrouter')
        || getGatewayBlockReason('openrouter') === 'quota_exhausted';
}

function clearGatewayModelHealthForTests() {
    blockedModels.clear();
    blockedSlugs.clear();
}

function clearGatewayModelBlock({ gatewayModel = '', slug = '' } = {}) {
    pruneExpired();
    const modelId = normalizeModelId(gatewayModel);
    const slugKey = normalizeSlug(slug);
    if (modelId) blockedModels.delete(modelId);
    if (slugKey) blockedSlugs.delete(slugKey);
}

module.exports = {
    markGatewayModelBlocked,
    markOpenRouterCreditsExhausted,
    isOpenRouterCreditsExhausted,
    isGatewayModelBlocked,
    getGatewayModelBlock,
    isSlugBlockedByGatewayHealth,
    getGatewayBlockReason,
    listBlockedGatewayModels,
    clearGatewayModelBlock,
    clearGatewayModelHealthForTests,
    ttlMsForReason,
    RATE_LIMIT_COOLDOWN_MS,
};
