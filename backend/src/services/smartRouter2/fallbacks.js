const MAX_RUNTIME_FALLBACKS = 3;

const ERROR_CATEGORIES = {
    auth: 'authentication',
    invalid: 'invalid_request',
    rate_limit: 'rate_limit',
    timeout: 'timeout',
    unavailable: 'unavailable_model',
    server: 'server_error',
    network: 'network',
    unknown: 'unknown',
};

function categorizeHttpStatus(status) {
    if (status === 401 || status === 403) return ERROR_CATEGORIES.auth;
    if (status === 400 || status === 422) return ERROR_CATEGORIES.invalid;
    if (status === 429) return ERROR_CATEGORIES.rate_limit;
    if (status === 404) return ERROR_CATEGORIES.unavailable;
    if (status === 504 || status === 408) return ERROR_CATEGORIES.timeout;
    if (status >= 500) return ERROR_CATEGORIES.server;
    return ERROR_CATEGORIES.unknown;
}

function categorizeFetchError(error) {
    const message = String(error?.message || '');
    if (/timed?\s*out/i.test(message) || error?.name === 'TimeoutError') {
        return ERROR_CATEGORIES.timeout;
    }
    if (/connect|network|fetch failed/i.test(message)) {
        return ERROR_CATEGORIES.network;
    }
    return ERROR_CATEGORIES.unknown;
}

/**
 * Authentication and invalid-request failures must not be retried blindly
 * across providers (misconfigured keys / bad payloads would loop forever).
 */
function shouldTryFallback(category) {
    return [
        ERROR_CATEGORIES.rate_limit,
        ERROR_CATEGORIES.timeout,
        ERROR_CATEGORIES.unavailable,
        ERROR_CATEGORIES.server,
        ERROR_CATEGORIES.network,
    ].includes(category);
}

module.exports = {
    MAX_RUNTIME_FALLBACKS,
    ERROR_CATEGORIES,
    categorizeHttpStatus,
    categorizeFetchError,
    shouldTryFallback,
};
