'use strict';

/**
 * Unified outbound AI provider gateway — validation, timeouts, retries,
 * circuit breaker, telemetry, and redacted structured logging.
 * Returns native fetch Response objects (streaming-safe).
 */

const { sanitizeProviderHint, classifyProviderError, slugToProviderId } = require('./providerErrorClassification');
const { recordProviderRequest } = require('./providerRequestTelemetry');
const circuitBreaker = require('./providerCircuitBreaker');
const {
    categorizeHttpStatus,
    categorizeFetchError,
    shouldTryFallback,
    ERROR_CATEGORIES,
} = require('./smartRouter2/fallbacks');

const DEFAULT_TIMEOUT_MS = Math.min(
    Math.max(Number(process.env.AI_REQUEST_TIMEOUT_MS) || 45_000, 5_000),
    120_000,
);
const DEFAULT_MAX_RETRIES = Math.min(Math.max(Number(process.env.AI_GATEWAY_MAX_RETRIES) || 2, 0), 4);

/** Host allowlist per provider id (direct API paths only). */
const PROVIDER_ALLOWLIST = Object.freeze({
    gemini: ['generativelanguage.googleapis.com'],
    groq: ['api.groq.com'],
    openrouter: ['openrouter.ai'],
    openai: ['api.openai.com'],
    cloudflare: ['api.cloudflare.com'],
    ollama: ['ollama.com', 'localhost', '127.0.0.1'],
    claude: ['api.anthropic.com'],
    deepseek: ['api.deepseek.com'],
    mistral: ['api.mistral.ai'],
    grok: ['api.x.ai'],
    perplexity: ['api.perplexity.ai'],
    kimi: ['api.moonshot.cn', 'api.moonshot.ai'],
});

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function inferProviderFromUrl(urlString) {
    try {
        const host = new URL(urlString).hostname.toLowerCase();
        for (const [provider, hosts] of Object.entries(PROVIDER_ALLOWLIST)) {
            if (hosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))) {
                return provider;
            }
        }
    } catch {
        /* ignore */
    }
    return 'unknown';
}

function redactUrlForLog(urlString) {
    try {
        const parsed = new URL(urlString);
        if (parsed.searchParams.has('key')) parsed.searchParams.set('key', '[redacted]');
        return parsed.toString();
    } catch {
        return '[invalid-url]';
    }
}

function validateGatewayRequest({ url, method = 'GET', provider }) {
    const errors = [];
    if (!url || typeof url !== 'string') errors.push('url_required');
    let parsed;
    try {
        parsed = new URL(url);
    } catch {
        errors.push('url_invalid');
    }
    if (parsed) {
        const isLocal = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
        if (parsed.protocol !== 'https:' && !isLocal) errors.push('https_required');
    }
    const resolvedProvider = provider && provider !== 'unknown'
        ? String(provider).toLowerCase()
        : inferProviderFromUrl(url);
    const allowed = PROVIDER_ALLOWLIST[resolvedProvider];
    if (allowed?.length && parsed) {
        const host = parsed.hostname.toLowerCase();
        const matches = (id) => {
            const list = PROVIDER_ALLOWLIST[id];
            return Array.isArray(list) && list.some((entry) => host === entry || host.endsWith(`.${entry}`));
        };
        // Model slug (gemini, gpt, …) may be served by another allowlisted host such as OpenRouter.
        const inferred = inferProviderFromUrl(url);
        const hostOk = matches(resolvedProvider) || (inferred !== 'unknown' && matches(inferred));
        if (!hostOk) errors.push('host_not_allowed_for_provider');
    }
    const verb = String(method || 'GET').toUpperCase();
    if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'].includes(verb)) {
        errors.push('method_not_allowed');
    }
    return { ok: errors.length === 0, errors, provider: resolvedProvider };
}

function logGatewayEvent(payload) {
    try {
        console.log(JSON.stringify({
            ts: new Date().toISOString(),
            scope: 'ai_gateway',
            ...payload,
        }));
    } catch {
        /* ignore logging failures */
    }
}

async function peekErrorMessage(response) {
    try {
        const clone = response.clone();
        const data = await clone.json().catch(() => ({}));
        const message = data?.error?.message || data?.message || data?.error || '';
        return sanitizeProviderHint(String(message || ''), 200);
    } catch {
        return null;
    }
}

function syntheticProviderResponse({ timedOut = false, message = '' } = {}) {
    const body = {
        error: {
            message: timedOut
                ? 'The AI provider took too long to respond. Try again or choose another configured model.'
                : (message || 'Could not connect to the AI service. Try again or choose another configured model.'),
        },
    };
    return new Response(JSON.stringify(body), {
        status: timedOut ? 504 : 502,
        headers: { 'Content-Type': 'application/json' },
    });
}

function isRetryableHttpStatus(status) {
    const category = categorizeHttpStatus(Number(status) || 0);
    // Router handles provider fallback; gateway retries only transient server/network faults.
    if (category === ERROR_CATEGORIES.rate_limit || category === ERROR_CATEGORIES.timeout) {
        return false;
    }
    return shouldTryFallback(category);
}

function isRetryableFetchError({ timedOut, category }) {
    if (timedOut || category === ERROR_CATEGORIES.timeout) return false;
    return shouldTryFallback(category);
}

/**
 * @param {object} opts
 * @param {string} opts.url
 * @param {string} [opts.provider]
 * @param {string} [opts.correlationId]
 * @param {number} [opts.timeoutMs]
 * @param {number} [opts.maxRetries]
 * @param {boolean} [opts.stream] — when true, only retries before body is consumed
 * @param {typeof fetch} [opts.fetchImpl]
 */
async function gatewayFetch({
    url,
    provider,
    correlationId = null,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxRetries = DEFAULT_MAX_RETRIES,
    stream = false,
    fetchImpl = globalThis.fetch,
    ...fetchInit
} = {}) {
    const validation = validateGatewayRequest({
        url,
        method: fetchInit.method,
        provider,
    });
    if (!validation.ok) {
        logGatewayEvent({
            phase: 'validation_failed',
            correlationId,
            errors: validation.errors,
            url: redactUrlForLog(url),
        });
        return syntheticProviderResponse({
            message: 'Outbound AI request failed gateway validation.',
        });
    }

    const providerId = validation.provider;
    if (!circuitBreaker.canAttempt(providerId)) {
        logGatewayEvent({
            phase: 'circuit_open',
            correlationId,
            provider: providerId,
        });
        return new Response(JSON.stringify({
            error: {
                message: 'This AI provider is temporarily unavailable. Try again shortly or choose another model.',
                code: 'PROVIDER_CIRCUIT_OPEN',
            },
        }), { status: 503, headers: { 'Content-Type': 'application/json' } });
    }

    const startedAt = Date.now();
    let attempt = 0;
    const maxAttempts = 1 + Math.max(0, Number(maxRetries) || 0);

    while (attempt < maxAttempts) {
        attempt += 1;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        logGatewayEvent({
            phase: 'request',
            correlationId,
            provider: providerId,
            attempt,
            stream: Boolean(stream),
            url: redactUrlForLog(url),
            method: String(fetchInit.method || 'GET').toUpperCase(),
        });

        try {
            const response = await fetchImpl(url, {
                ...fetchInit,
                signal: controller.signal,
            });
            clearTimeout(timer);
            const latencyMs = Date.now() - startedAt;

            if (response.ok) {
                recordProviderRequest({ provider: providerId, success: true, latencyMs });
                logGatewayEvent({
                    phase: 'response',
                    correlationId,
                    provider: providerId,
                    status: response.status,
                    latencyMs,
                    attempt,
                });
                return response;
            }

            const hint = await peekErrorMessage(response);
            const classification = classifyProviderError({
                httpStatus: response.status,
                message: hint || '',
            });
            recordProviderRequest({
                provider: providerId,
                success: false,
                latencyMs,
                httpStatus: response.status,
                message: hint,
                errorCategory: classification.errorClass,
            });

            const retryable = isRetryableHttpStatus(response.status);
            logGatewayEvent({
                phase: 'response',
                correlationId,
                provider: providerId,
                status: response.status,
                latencyMs,
                attempt,
                retryable,
                errorClass: classification.errorClass,
            });

            if (retryable && attempt < maxAttempts) {
                try {
                    await response.body?.cancel?.();
                } catch {
                    /* ignore */
                }
                await sleep(280 * (2 ** (attempt - 1)) + Math.floor(Math.random() * 120));
                continue;
            }
            return response;
        } catch (error) {
            clearTimeout(timer);
            const latencyMs = Date.now() - startedAt;
            const timedOut = error.name === 'AbortError'
                || error.name === 'TimeoutError'
                || /timed?\s*out/i.test(String(error.message || ''));
            const category = categorizeFetchError(error);
            recordProviderRequest({
                provider: providerId,
                success: false,
                latencyMs,
                timedOut,
                message: sanitizeProviderHint(error.message),
                errorCategory: category,
            });
            logGatewayEvent({
                phase: 'error',
                correlationId,
                provider: providerId,
                attempt,
                timedOut,
                category,
            });

            if (isRetryableFetchError({ timedOut, category }) && attempt < maxAttempts) {
                await sleep(280 * (2 ** (attempt - 1)));
                continue;
            }
            return syntheticProviderResponse({ timedOut, message: sanitizeProviderHint(error.message) });
        }
    }

    return syntheticProviderResponse({ timedOut: true });
}

/** Drop-in fetch wrapper for chat streaming (preserves Response body). */
function createChatGatewayFetch({
    correlationId,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxRetries = DEFAULT_MAX_RETRIES,
    resolveProvider,
} = {}) {
    return async (url, options = {}, meta = {}) => {
        const provider = meta.provider
            || (typeof resolveProvider === 'function' ? resolveProvider(url, options, meta) : null)
            || inferProviderFromUrl(url);
        return gatewayFetch({
            url,
            provider,
            correlationId,
            timeoutMs,
            maxRetries,
            stream: true,
            fetchImpl: globalThis.fetch,
            ...options,
        });
    };
}

/** Chat handler entry — resolves provider from current routed slug or URL host. */
function createChatProviderFetch({
    correlationId,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxRetries = DEFAULT_MAX_RETRIES,
    routedModel,
} = {}) {
    return createChatGatewayFetch({
        correlationId,
        timeoutMs,
        maxRetries,
        resolveProvider: (url, _options, meta = {}) => (
            meta.provider
            || slugToProviderId(routedModel)
            || inferProviderFromUrl(url)
        ),
    });
}

function getGatewaySnapshot() {
    const { passiveStatusForProvider } = require('./providerRequestTelemetry');
    const providers = ['gemini', 'groq', 'cloudflare', 'ollama', 'openrouter', 'openai'];
    const circuit = {};
    const telemetry = {};
    for (const id of providers) {
        circuit[id] = circuitBreaker.snapshot(id);
        telemetry[id] = passiveStatusForProvider(id, true);
    }
    return {
        version: 1,
        timeoutMs: DEFAULT_TIMEOUT_MS,
        maxRetries: DEFAULT_MAX_RETRIES,
        circuit,
        telemetry,
    };
}

/**
 * Ordered fallback slugs that are configured and pass circuit/health gates.
 * Smart Router may still apply its own policy on top.
 */
function listSafeFallbackSlugs({ prefer = [], hasVision = false } = {}) {
    let availability;
    let isAvailable;
    try {
        const health = require('../providerHealth');
        availability = health.providerAvailabilityForRouter();
        isAvailable = health.isRoutedModelAvailable;
    } catch {
        return prefer.slice();
    }
    const visionOk = (slug) => {
        if (!hasVision) return true;
        return ['gpt', 'gemini', 'claude', 'smart'].includes(slug);
    };
    const ordered = [...new Set([...prefer, 'gemini', 'gpt', 'groq', 'cloudflare', 'ollama', 'claude'])];
    return ordered.filter((slug) => visionOk(slug) && isAvailable(slug, availability));
}

function resetGatewayStateForTests() {
    circuitBreaker.resetCircuitBreakersForTests?.();
    const { resetForTests: resetTelemetry } = require('./providerRequestTelemetry');
    resetTelemetry?.();
}

function validateOutboundRequest(url, opts = {}) {
    const result = validateGatewayRequest({
        url,
        method: opts.method,
        provider: opts.provider,
    });
    if (!result.ok) {
        const err = new Error(`Gateway validation failed: ${result.errors.join(',')}`);
        if (result.errors.includes('https_required')) err.code = 'GATEWAY_INSECURE_URL';
        else err.code = 'GATEWAY_VALIDATION';
        throw err;
    }
    return result;
}

async function executeProviderRequest({
    url,
    provider,
    correlationId = null,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxAttempts = 1 + DEFAULT_MAX_RETRIES,
    fetchImpl = globalThis.fetch,
    init = {},
} = {}) {
    const attempts = Math.max(1, Number(maxAttempts) || 1);
    return gatewayFetch({
        url,
        provider,
        correlationId,
        timeoutMs,
        maxRetries: attempts - 1,
        fetchImpl,
        stream: false,
        ...init,
    });
}

async function probeProviderEndpoint({ url, provider, init = {} } = {}) {
    return executeProviderRequest({
        url,
        provider,
        maxAttempts: 1,
        timeoutMs: 8000,
        fetchImpl: globalThis.fetch,
        init,
    });
}

function listGatewayFallbackProviders(options = {}) {
    return listSafeFallbackSlugs(options);
}

function getGatewayHealthSummary() {
    return getGatewaySnapshot();
}

function buildGatewayStatusSnapshot() {
    const summary = getGatewaySnapshot();
    let configured = {};
    try {
        configured = require('../providerHealth').buildProviderSnapshot();
    } catch {
        configured = {};
    }
    const providers = Object.keys(PROVIDER_ALLOWLIST).map((id) => ({
        id,
        configured: Boolean(configured[id]?.configured),
        circuit: summary.circuit[id] || circuitBreaker.snapshot(id),
        telemetry: summary.telemetry[id] || null,
    }));
    return {
        version: 1,
        timeoutMs: DEFAULT_TIMEOUT_MS,
        maxRetries: DEFAULT_MAX_RETRIES,
        providers,
        fallbackOrder: listGatewayFallbackProviders(),
    };
}

async function probeProviderHealth(providerId) {
    const id = String(providerId || '').trim().toLowerCase();
    const { buildProviderHealth } = require('../providerHealth');
    const health = await buildProviderHealth({ probe: true });
    const row = health[id];
    if (!row) {
        return { provider: id, status: 'unknown_provider', probedAt: new Date().toISOString() };
    }
    return { provider: id, ...row, probedAt: new Date().toISOString() };
}

module.exports = {
    PROVIDER_ALLOWLIST,
    DEFAULT_TIMEOUT_MS,
    DEFAULT_MAX_RETRIES,
    inferProviderFromUrl,
    redactUrlForLog,
    validateGatewayRequest,
    validateOutboundRequest,
    gatewayFetch,
    executeProviderRequest,
    probeProviderEndpoint,
    createChatGatewayFetch,
    createChatProviderFetch,
    getGatewaySnapshot,
    getGatewayHealthSummary,
    buildGatewayStatusSnapshot,
    probeProviderHealth,
    listSafeFallbackSlugs,
    listGatewayFallbackProviders,
    resetGatewayStateForTests,
};
