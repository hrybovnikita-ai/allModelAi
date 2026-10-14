const { passiveStatusForProvider } = require('./providerRequestTelemetry');
const { getCapabilities } = require('./smartRouter2/capabilities');
const { slugToProviderId } = require('./providerErrorClassification');

function isHealthAwareRoutingEnabled() {
    return String(process.env.SMART_ROUTER_USE_HEALTH || '').trim() === '1';
}

/** Penalty applied in router scoring when recent passive health is poor (optional). */
function healthPenaltyForSlug(slug) {
    if (!isHealthAwareRoutingEnabled()) return 0;
    const cap = getCapabilities(slug);
    if (!cap) return 0;
    const providerId = slugToProviderId(cap.provider) || cap.provider;
    const passive = passiveStatusForProvider(providerId, true);
    const status = passive.operationalStatus;
    if (status === 'authentication_failed' || status === 'unavailable') return -8;
    if (status === 'rate_limited' || status === 'quota_exhausted') return -3;
    if (status === 'degraded') return -2;
    return 0;
}

module.exports = {
    isHealthAwareRoutingEnabled,
    healthPenaltyForSlug,
};
