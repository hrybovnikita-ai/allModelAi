const { isBillingOrQuotaFailure } = require('../modelProviderEquivalence');

/** Map chat model slugs to provider catalog ids. */
function slugToProviderId(slug) {
    const key = String(slug || '').trim().toLowerCase();
    const map = {
        gpt: 'openai',
        copilot: 'openai',
        gemini: 'gemini',
        claude: 'claude',
        grok: 'grok',
        groq: 'groq',
        mistral: 'mistral',
        kimi: 'kimi',
        perplexity: 'perplexity',
        deepseek: 'deepseek',
        qwen: 'qwen',
        cohere: 'cohere',
        cloudflare: 'cloudflare',
        'gpt-oss': 'cloudflare',
        ollama: 'ollama',
        ollama_cloud: 'ollama',
        nemotron: 'openrouter',
        'deepseek-r1': 'openrouter',
        llama: 'openrouter',
    };
    return map[key] || key || 'unknown';
}

function sanitizeProviderHint(message, maxLen = 160) {
    const text = String(message || '')
        .replace(/sk-[a-zA-Z0-9_-]{8,}/g, '[redacted]')
        .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
        .trim();
    if (!text) return null;
    return text.length > maxLen ? `${text.slice(0, maxLen)}…` : text;
}

/**
 * Classify upstream provider failures for health monitoring and telemetry.
 * @returns {{ errorClass: string, operationalStatus: string, retryable: boolean }}
 */
function classifyProviderError({
    httpStatus = null,
    message = '',
    timedOut = false,
    billingHint = false,
} = {}) {
    if (timedOut) {
        return {
            errorClass: 'timeout',
            operationalStatus: 'degraded',
            retryable: true,
        };
    }

    const status = Number(httpStatus) || 0;
    const detail = String(message || '');

    if (billingHint || isBillingOrQuotaFailure(status, detail)) {
        const quota = /credit|balance|billing|afford|recharge|payment/i.test(detail) || status === 402;
        return {
            errorClass: quota ? 'quota_exhausted' : 'rate_limited',
            operationalStatus: quota ? 'quota_exhausted' : 'rate_limited',
            retryable: !quota,
        };
    }

    if (status === 401) {
        return { errorClass: 'authentication_failed', operationalStatus: 'authentication_failed', retryable: false };
    }
    if (status === 403) {
        return { errorClass: 'permission_denied', operationalStatus: 'unavailable', retryable: false };
    }
    if (status === 429) {
        return { errorClass: 'rate_limited', operationalStatus: 'rate_limited', retryable: true };
    }
    if (status === 400 || status === 422) {
        return { errorClass: 'invalid_request', operationalStatus: 'degraded', retryable: false };
    }
    if (status >= 500 && status <= 599) {
        return { errorClass: 'server_error', operationalStatus: 'degraded', retryable: true };
    }
    if (status === 502 || status === 503 || status === 504) {
        return { errorClass: 'server_error', operationalStatus: 'degraded', retryable: true };
    }
    if (/network|fetch failed|ECONNREFUSED|ENOTFOUND|socket hang up/i.test(detail)) {
        return { errorClass: 'network_error', operationalStatus: 'unavailable', retryable: true };
    }
    if (status > 0) {
        return { errorClass: 'upstream_error', operationalStatus: 'degraded', retryable: status >= 500 };
    }
    return { errorClass: 'unknown', operationalStatus: 'unknown', retryable: false };
}

module.exports = {
    slugToProviderId,
    sanitizeProviderHint,
    classifyProviderError,
};
