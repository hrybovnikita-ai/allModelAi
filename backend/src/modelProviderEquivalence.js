/** Detect quota/billing failures where an equivalent gateway route may still work. */
function isBillingOrQuotaFailure(status, detail) {
    const text = String(detail || '');
    if (status === 402) return true;
    if (status === 429 && /credit|quota|billing|rate limit|insufficient|afford/i.test(text)) return true;
    return /insufficient.*(balance|credit|quota)|no credits remaining|exceeded.*quota|rate limit exceeded/i.test(text);
}

function isTransientCapacityFailure(status, detail) {
    if (status === 503) return true;
    return /high demand|overloaded|temporarily unavailable/i.test(String(detail || ''));
}

function upstreamErrorMessage(data) {
    return String(data?.error?.message || data?.errors?.[0]?.message || data?.message || '').trim();
}

module.exports = {
    isBillingOrQuotaFailure,
    isTransientCapacityFailure,
    upstreamErrorMessage,
};
