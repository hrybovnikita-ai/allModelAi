/**
 * Central chat model entitlements (keep in sync with frontend/src/lib/modelEntitlements.js).
 *
 * Free User tier = exactly these five selectable models:
 * 1. Smart Router (free routes only)
 * 2. Anonin Model
 * 3. Gemini 3.5 Flash Lite
 * 4. Gemini 3.1 Flash Lite
 * 5. Gemini 3 Flash
 */
const ENTITLEMENT_TIER = Object.freeze({
    FREE: 'free',
    PRO: 'pro',
    ADMIN: 'admin',
});

/** Registry variant ids from backend/src/data/modelVariants.json (gemini). */
const FREE_GEMINI_VARIANT_IDS = Object.freeze([
    '3.5-flash-lite',
    '3.1-flash-lite',
    '3-flash',
]);

/**
 * Canonical entitlement keys returned on /api/credits for free accounts.
 * @type {readonly string[]}
 */
const FREE_USER_MODEL_KEYS = Object.freeze([
    'smart',
    'anonin',
    'gemini:3.5-flash-lite',
    'gemini:3.1-flash-lite',
    'gemini:3-flash',
]);

const FREE_USER_MODEL_COUNT = FREE_USER_MODEL_KEYS.length;

const ALWAYS_ALLOWED_SLUGS = Object.freeze(['smart', 'ai_python']);

/** Slugs Smart Router may target for free-tier users (subset of paid providers). */
const FREE_SMART_ROUTER_SLUGS = Object.freeze(['gemini', 'anonin']);

const DEFAULT_FREE_GEMINI_VARIANT_ID = '3.5-flash-lite';

function entitlementKey(slug, variantId) {
    const normalizedSlug = String(slug || '').trim();
    if (!normalizedSlug) return '';
    if (normalizedSlug === 'smart' || normalizedSlug === 'anonin' || normalizedSlug === 'ai_python') {
        return normalizedSlug;
    }
    const variant = String(variantId || '').trim();
    if (variant) return `${normalizedSlug}:${variant}`;
    return normalizedSlug;
}

function isPaidPlanAccess(access) {
    if (!access) return false;
    if (access.isOwner && access.mode !== 'user' && access.plusActive !== false) return true;
    if (access.isDeveloper && access.canUseDeveloper && access.mode === 'developer') return true;
    if (Array.isArray(access.models) && access.models.includes('all')) return true;
    if (access.hasSubscription && access.active) return true;
    if (access.unlimited && access.canUseDeveloper) return true;
    return false;
}

function resolveEntitlementTier(access) {
    if (!access) return ENTITLEMENT_TIER.FREE;
    if (access.isOwner && access.mode !== 'user' && access.plusActive !== false) {
        return ENTITLEMENT_TIER.ADMIN;
    }
    if (access.isDeveloper && access.canUseDeveloper && access.mode === 'developer') {
        return ENTITLEMENT_TIER.ADMIN;
    }
    if (Array.isArray(access.models) && access.models.includes('all')) {
        return ENTITLEMENT_TIER.PRO;
    }
    if (access.hasSubscription && access.active) {
        return ENTITLEMENT_TIER.PRO;
    }
    if (access.unlimited && access.canUseDeveloper) {
        return ENTITLEMENT_TIER.PRO;
    }
    return ENTITLEMENT_TIER.FREE;
}

function freeEntitlementKeysForAccess(access) {
    if (Array.isArray(access?.freeModelKeys) && access.freeModelKeys.length) {
        return access.freeModelKeys;
    }
    if (Array.isArray(access?.models) && access.models.every((k) => String(k).includes(':') || k === 'smart' || k === 'anonin')) {
        return access.models;
    }
    return [...FREE_USER_MODEL_KEYS];
}

function hasFreeModelEntitlement(access, slug, variantId) {
    const normalizedSlug = String(slug || '').trim();
    if (!normalizedSlug) return false;
    if (normalizedSlug === 'smart') return true;
    if (normalizedSlug === 'anonin') return true;
    if (normalizedSlug === 'ai_python') return true;

    const keys = new Set(freeEntitlementKeysForAccess(access));
    if (normalizedSlug === 'gemini') {
        const resolvedVariant = String(variantId || DEFAULT_FREE_GEMINI_VARIANT_ID).trim();
        return keys.has(`gemini:${resolvedVariant}`);
    }
    const key = entitlementKey(normalizedSlug, variantId);
    return keys.has(key);
}

function hasModelEntitlement(access, slug, variantId) {
    const normalizedSlug = String(slug || '').trim();
    if (!normalizedSlug) return false;
    if (ALWAYS_ALLOWED_SLUGS.includes(normalizedSlug)) return true;

    if (access?.isOwner && access.mode !== 'user' && access.plusActive !== false) {
        return true;
    }
    if (access?.isOwner && access.ownerPreview) {
        return hasFreeModelEntitlement(access, normalizedSlug, variantId);
    }

    if (isPaidPlanAccess(access)) {
        const allowed = access?.models || [];
        if (allowed.includes('all')) return true;
        return allowed.includes(normalizedSlug);
    }

    return hasFreeModelEntitlement(access, normalizedSlug, variantId);
}

function attachEntitlementMetadata(status) {
    if (!status || typeof status !== 'object') return status;
    const paid = isPaidPlanAccess(status);
    return {
        ...status,
        entitlementTier: resolveEntitlementTier(status),
        freeModelKeys: paid ? null : [...FREE_USER_MODEL_KEYS],
        freeModelCount: paid ? null : FREE_USER_MODEL_COUNT,
        models: paid ? (status.models || ['all']) : [...FREE_USER_MODEL_KEYS],
    };
}

function countFreeInferenceModels() {
    return FREE_USER_MODEL_COUNT;
}

module.exports = {
    ENTITLEMENT_TIER,
    FREE_GEMINI_VARIANT_IDS,
    FREE_USER_MODEL_KEYS,
    FREE_USER_MODEL_COUNT,
    FREE_SMART_ROUTER_SLUGS,
    ALWAYS_ALLOWED_SLUGS,
    DEFAULT_FREE_GEMINI_VARIANT_ID,
    entitlementKey,
    countFreeInferenceModels,
    resolveEntitlementTier,
    hasModelEntitlement,
    hasFreeModelEntitlement,
    isPaidPlanAccess,
    attachEntitlementMetadata,
    /** @deprecated use FREE_USER_MODEL_KEYS */
    FREE_PLAN_CHAT_MODELS: FREE_USER_MODEL_KEYS,
};
