'use strict';

const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const {
    isGatewayModelBlocked,
    isSlugBlockedByGatewayHealth,
    markGatewayModelBlocked,
    clearGatewayModelBlock,
    ttlMsForReason,
} = require('./gatewayModelHealth');
const { recordVerifiedInference } = require('./verifiedInferenceHealth');

const modelVariants = JSON.parse(
    readFileSync(join(__dirname, '../data/modelVariants.json'), 'utf8'),
);

function gatewayReasonFromHttp(status, message = '') {
    const code = Number(status) || 0;
    const msg = String(message || '').toLowerCase();
    if (code === 401 || code === 403) return 'authentication_failed';
    if (code === 404 || /invalid model|not found|not a valid model/i.test(msg)) return 'invalid_model';
    if (code === 402 || /insufficient credit|quota exceeded|billing|payment required/i.test(msg)) {
        return 'quota_exhausted';
    }
    if (code === 429) {
        return /quota|billing|credit|plan/i.test(msg) ? 'quota_exhausted' : 'rate_limited';
    }
    if (code >= 500 || code === 408) return 'degraded';
    return 'unavailable';
}

function shouldBlockRouterFromDiagnostic({ ok, status, message, routeMode }) {
    if (ok || routeMode === 'blocked') return false;
    const code = Number(status) || 0;
    const msg = String(message || '').toLowerCase();
    if (code === 401 || code === 403 || code === 404 || code === 402) return true;
    if (code === 429 && /quota|billing|credit|plan/i.test(msg)) return true;
    if (/invalid model|not a valid model|model.*not found/i.test(msg)) return true;
    return false;
}

function shouldCooldownFromDiagnostic({ ok, status, message }) {
    if (ok) return false;
    const code = Number(status) || 0;
    const msg = String(message || '').toLowerCase();
    if (code === 429 && !/quota|billing|credit|plan/i.test(msg)) return true;
    if (code >= 500 || code === 408) return true;
    return false;
}

/**
 * @param {object} opts
 * @param {string} opts.slug
 * @param {object} opts.route from pickRoute
 * @param {boolean} opts.ok
 * @param {number} [opts.status]
 * @param {string} [opts.message]
 */
function applyModelDiagnosticToRouterHealth({ slug, route, ok, status, message, variantId }) {
    const modelId = route?.providerModel || route?.model;
    if (!modelId) return;
    if (ok) {
        clearGatewayModelBlock({ gatewayModel: modelId });
        recordVerifiedInference({
            slug,
            variantId: variantId || 'default',
            routeMode: route?.mode,
            modelId,
        });
        return;
    }
    const reason = gatewayReasonFromHttp(status, message);
    if (shouldCooldownFromDiagnostic({ ok, status, message })) {
        markGatewayModelBlocked({
            gatewayModel: modelId,
            slug: '',
            reason,
            ttlMs: ttlMsForReason(reason),
            blockSlug: false,
        });
        return;
    }
    if (!shouldBlockRouterFromDiagnostic({ ok, status, message, routeMode: route?.mode })) return;
    markGatewayModelBlocked({
        gatewayModel: modelId,
        slug: '',
        reason,
        blockSlug: false,
    });
}

function isSlugDefaultRouteBlocked(pickRoute, slug) {
    if (isSlugBlockedByGatewayHealth(slug)) return true;
    const variants = modelVariants[slug];
    if (!variants?.length || typeof pickRoute !== 'function') return false;
    const route = pickRoute(slug, variants[0]);
    if (route.mode === 'blocked') return true;
    const modelId = route.providerModel || route.model;
    return Boolean(modelId && isGatewayModelBlocked(modelId));
}

module.exports = {
    applyModelDiagnosticToRouterHealth,
    gatewayReasonFromHttp,
    isSlugDefaultRouteBlocked,
    shouldBlockRouterFromDiagnostic,
    shouldCooldownFromDiagnostic,
};
