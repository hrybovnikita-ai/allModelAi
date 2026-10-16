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

/**
 * Accurate OpenRouter billing error for the selected model family.
 * Never recommend Gemini when the user selected GPT (or another non-Gemini slug).
 */
function mapOpenRouterBillingError(status, detail = '', options = {}) {
    const mapped = isOpenRouterInsufficientCredits(status, detail);
    if (!mapped) return null;
    const routed = String(options.routedModel || options.requestedModel || '').toLowerCase();
    const gatewayModel = String(options.gatewayModel || options.model || '').trim();
    const modelLabel = gatewayModel || 'this model';
    let message;
    if (routed === 'gpt' || routed === 'copilot') {
        message = `OpenRouter could not run ${modelLabel}: insufficient credits. Add OpenRouter credits at openrouter.ai/settings/credits, or set a valid OPENAI_API_KEY (sk-…) on the server to call OpenAI directly for GPT.`;
    } else if (routed === 'gemini') {
        message = `OpenRouter could not run ${modelLabel}: insufficient credits. Add OpenRouter credits, or set GEMINI_API_KEY to use Google Gemini directly.`;
    } else if (routed) {
        message = `OpenRouter could not run ${modelLabel} for ${routed}: insufficient credits. Add OpenRouter credits, or configure a direct API key for the selected provider.`;
    } else {
        message = `OpenRouter reports insufficient credits for ${modelLabel}. Add OpenRouter credits, or configure a direct API key for the selected provider.`;
    }
    return {
        clientStatus: 402,
        code: 'OPENROUTER_INSUFFICIENT_CREDITS',
        message,
        provider: 'openrouter',
        model: gatewayModel || null,
        routedModel: routed || null,
    };
}

module.exports = {
    isBillingOrQuotaFailure,
    isOpenRouterInsufficientCredits,
    isTransientCapacityFailure,
    mapOpenRouterBillingError,
    upstreamErrorMessage,
};
