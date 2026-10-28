const { passiveStatusForProvider } = require('./providerRequestTelemetry');
const { getCapabilities } = require('./smartRouter2/capabilities');
const { slugToProviderId } = require('./providerErrorClassification');
const { slugDependsOnOpenRouterPaidCredits } = require('../chatProviderRuntime');
const { isSlugBlockedByGatewayHealth } = require('./gatewayModelHealth');

function isHealthAwareRoutingEnabled() {
    return String(process.env.SMART_ROUTER_USE_HEALTH || '').trim() === '1';
}

function penaltyForStatus(status) {
    if (status === 'authentication_failed' || status === 'unavailable') return -8;
    if (status === 'rate_limited' || status === 'quota_exhausted') return -3;
    if (status === 'degraded') return -2;
    return 0;
}

/** Penalty applied in router scoring when recent passive health is poor (optional). */
function healthPenaltyForSlug(slug) {
    if (isSlugBlockedByGatewayHealth(slug)) return -8;
    if (!isHealthAwareRoutingEnabled()) return 0;
    const cap = getCapabilities(slug);
    if (!cap) return 0;
    const providerId = slugToProviderId(cap.provider) || cap.provider;
    const passive = passiveStatusForProvider(providerId, true);
    let penalty = penaltyForStatus(passive.operationalStatus);
    if (slugDependsOnOpenRouterPaidCredits(slug)) {
        const openRouter = passiveStatusForProvider('openrouter', true);
        penalty = Math.min(penalty, penaltyForStatus(openRouter.operationalStatus));
    }
    return penalty;
}

module.exports = {
    isHealthAwareRoutingEnabled,
    healthPenaltyForSlug,
};
