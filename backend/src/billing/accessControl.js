const { subscriptionPlans, normalizePlanKey } = require('./plans');
const { getOpenRouterApiKey } = require('../openRouterConfig');

function openRouterKey() {
    return getOpenRouterApiKey();
}

/** OpenRouter route for zero-cost inference when configured (Free plan). */
const OPENROUTER_FREE_MODEL = () => String(process.env.OPENROUTER_FREE_MODEL || 'openrouter/free').trim();

const PLAN_ALIASES = {
    free: 'free',
    pro: 'common',
    premium: 'plus',
    common: 'common',
    plus: 'plus',
    week: 'week',
    power: 'plus',
};

function normalizeAppPlan(planKey) {
    const key = normalizePlanKey(planKey);
    return PLAN_ALIASES[key] || key || 'free';
}

function isOwnerRole(role) {
    return String(role || '').trim().toLowerCase() === 'owner';
}

function isOwner(userOrAccess) {
    if (!userOrAccess) return false;
    if (userOrAccess.isOwner === true) return true;
    return isOwnerRole(userOrAccess.role);
}

/** Owner with complimentary Plus active (not User preview mode). */
function ownerPlusActive(access) {
    if (!isOwner(access)) return false;
    if (access.plusActive === true) return true;
    return access.mode === 'developer';
}

function modelsForPlan(planKey) {
    const key = normalizeAppPlan(planKey);
    const plan = subscriptionPlans[key] || subscriptionPlans.free;
    return plan.models || subscriptionPlans.free.models;
}

function hasModelAccess(access, modelSlug) {
    const slug = String(modelSlug || '').trim();
    if (!slug || slug === 'smart' || slug === 'ai_python') return true;
    if (ownerPlusActive(access)) return true;
    const allowed = access?.models || modelsForPlan(access?.plan);
    if (allowed.includes('all')) return true;
    return allowed.includes(slug);
}

function checkUsageLimit(access) {
    if (ownerPlusActive(access) || access?.unlimited) {
        return { allowed: true };
    }
    if (access?.enforced && Number(access.used) >= Number(access.limit)) {
        return {
            allowed: false,
            status: 429,
            code: 'PLAN_LIMIT_REACHED',
            message: `Your ${access.planDisplayName || access.plan || 'plan'} plan has reached its request limit. Upgrade to continue.`,
        };
    }
    return { allowed: true };
}

function applyOwnerAccess(baseStatus, role, { savedMode } = {}) {
    if (!isOwnerRole(role)) {
        return {
            ...baseStatus,
            role: String(role || 'user').toLowerCase(),
            isOwner: false,
            canManageOwnerMode: false,
        };
    }

    const persistedMode = savedMode ?? baseStatus.savedMode;
    const plusMode = persistedMode !== 'user';
    const freePlan = subscriptionPlans.free;
    const used = Number(baseStatus.used ?? 0);
    const previewLimit = Number.isFinite(Number(baseStatus.limit))
        ? Number(baseStatus.limit)
        : freePlan.limit;
    const previewRemaining = Math.max(previewLimit - used, 0);

    const shared = {
        ...baseStatus,
        role: 'owner',
        isOwner: true,
        ownerEntitlement: 'plus',
        canUseDeveloper: true,
        canManageOwnerMode: true,
        subscriptionStatus: 'owner',
        planDisplayName: 'Owner',
        currentPlan: 'Owner',
        savedMode: plusMode ? 'developer' : 'user',
    };

    if (!plusMode) {
        return {
            ...shared,
            mode: 'user',
            ownerPreview: true,
            plusActive: false,
            plusBranding: false,
            unlimited: false,
            enforced: baseStatus.enforced,
            models: freePlan.models,
            plan: baseStatus.plan || 'free',
            limit: previewLimit,
            remaining: previewRemaining,
            planLabel: 'Owner · User preview',
        };
    }

    return {
        ...shared,
        mode: 'developer',
        ownerPreview: false,
        plusActive: true,
        plusBranding: true,
        unlimited: true,
        enforced: false,
        models: ['all'],
        limit: null,
        remaining: null,
        planLabel: 'Owner · Plus',
    };
}

/**
 * When Smart Router uses OpenRouter, Free users use the free model route unless they are owner Plus.
 * Explicit model picks (e.g. qwen, gemini) keep their gateway/direct ids.
 */
function resolveOpenRouterModelId({ access, routedModel, gatewayModel, usesDirectProvider, requestedModel }) {
    if (usesDirectProvider) return gatewayModel;
    if (ownerPlusActive(access)) return gatewayModel;
    const plan = normalizeAppPlan(access?.plan);
    const requested = String(requestedModel || '').trim().toLowerCase();
    if (plan === 'free' && openRouterKey() && requested === 'smart') {
        return OPENROUTER_FREE_MODEL();
    }
    return gatewayModel;
}

function shouldPreferFreeOpenRouter(access, { requestedModel } = {}) {
    if (ownerPlusActive(access)) return false;
    if (normalizeAppPlan(access?.plan) !== 'free' || !openRouterKey()) return false;
    return String(requestedModel || '').trim().toLowerCase() === 'smart';
}

function planTierLabel(planKey) {
    const key = normalizeAppPlan(planKey);
    if (key === 'common') return 'Pro';
    if (key === 'plus') return 'Premium';
    if (key === 'week') return 'Weekly';
    return 'Free';
}

async function recordUsage(connection, access, { temporary = false, bumpUsageFn } = {}) {
    if (temporary || ownerPlusActive(access)) return;
    if (typeof bumpUsageFn === 'function') {
        await bumpUsageFn(connection, access.email);
    }
}

module.exports = {
    OPENROUTER_FREE_MODEL,
    applyOwnerAccess,
    checkUsageLimit,
    hasModelAccess,
    isOwner,
    isOwnerRole,
    modelsForPlan,
    normalizeAppPlan,
    ownerPlusActive,
    planTierLabel,
    recordUsage,
    resolveOpenRouterModelId,
    shouldPreferFreeOpenRouter,
};
