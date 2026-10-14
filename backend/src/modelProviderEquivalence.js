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

/** OpenRouter credit/billing failures (not Google Gemini quota). */
function isOpenRouterInsufficientCredits(status, detail) {
    const text = String(detail || '').toLowerCase();
    if (Number(status) === 402) return true;
    return /insufficient credits|requires more credits|can not afford|cannot afford|openrouter/i.test(text)
        && /credit|balance|afford|payment|purchase/i.test(text);
}

function mapOpenRouterBillingError(status, detail = '') {
    const mapped = isOpenRouterInsufficientCredits(status, detail);
    if (!mapped) return null;
    return {
        clientStatus: 402,
        code: 'OPENROUTER_INSUFFICIENT_CREDITS',
        message: 'OpenRouter reports insufficient credits for this model. Add OpenRouter credits or configure GEMINI_API_KEY to use Google Gemini directly.',
        provider: 'openrouter',
    };
}

module.exports = {
    isBillingOrQuotaFailure,
    isOpenRouterInsufficientCredits,
    isTransientCapacityFailure,
    mapOpenRouterBillingError,
    upstreamErrorMessage,
};
