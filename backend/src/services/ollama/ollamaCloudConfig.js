/**
 * Ollama Cloud (https://ollama.com/v1) — OpenAI-compatible.
 * API key stays server-side only (OLLAMA_API_KEY). Never log or return the key.
 */

const { sanitizeEnvSecret } = require('../../openRouterConfig');
const { sanitizeProviderHint } = require('../providerErrorClassification');

/** Documented OpenAI-compatible base. Override with OLLAMA_BASE_URL if needed. */
const DEFAULT_OLLAMA_CLOUD_BASE = 'https://ollama.com/v1';

/**
 * Verified from GET https://ollama.com/v1/models (2026-10-16).
 * Do not invent IDs — refresh via listOllamaCloudModels() when online.
 */
/** Synced with GET https://ollama.com/v1/models (20 models). */
const VERIFIED_OLLAMA_CLOUD_MODELS = Object.freeze([
    'clef:27b',
    'deepseek-v4-pro:0813',
    'deepseek-v4.1-flash',
    'gemma4:31b',
    'glm-5.2',
    'glm-5.3',
    'glm-5.3-flash',
    'gpt-oss:120b',
    'gpt-oss:20b',
    'kimi-k2.6',
    'kimi-k2.7-code',
    'kimi-k3',
    'minimax-m2.7',
    'minimax-m3',
    'mistral-large-3:675b',
    'mistral-large-4',
    'muse-spark-open',
    'nemotron-3-nano:30b',
    'nemotron-3-super',
    'nemotron-3-ultra',
]);

const DEFAULT_OLLAMA_CLOUD_MODEL = 'gemma4:31b';

function envTrim(name) {
    return sanitizeEnvSecret(process.env[name]);
}

function getOllamaApiKey() {
    return envTrim('OLLAMA_API_KEY');
}

function getOllamaCloudBaseUrl() {
    const raw = envTrim('OLLAMA_BASE_URL') || DEFAULT_OLLAMA_CLOUD_BASE;
    try {
        const url = new URL(raw.replace(/\/$/, ''));
        if (!/^https?:$/i.test(url.protocol)) {
            return DEFAULT_OLLAMA_CLOUD_BASE;
        }
        // Block accidental localhost SSRF when intending cloud.
        const host = url.hostname.toLowerCase();
        if (host === '127.0.0.1' || host === 'localhost' || host === '::1') {
            return DEFAULT_OLLAMA_CLOUD_BASE;
        }
        return url.origin + (url.pathname === '/' ? '' : url.pathname.replace(/\/$/, ''));
    } catch {
        return DEFAULT_OLLAMA_CLOUD_BASE;
    }
}

function isOllamaCloudConfigured() {
    return Boolean(getOllamaApiKey());
}

function ollamaCloudChatCompletionsUrl() {
    return `${getOllamaCloudBaseUrl()}/chat/completions`;
}

function ollamaCloudModelsUrl() {
    return `${getOllamaCloudBaseUrl()}/models`;
}

function resolveOllamaCloudModel(selectedVariant) {
    if (selectedVariant?.direct) return String(selectedVariant.direct).trim();
    if (selectedVariant?.gateway && !String(selectedVariant.gateway).includes('/')) {
        return String(selectedVariant.gateway).trim();
    }
    return envTrim('OLLAMA_CLOUD_MODEL') || DEFAULT_OLLAMA_CLOUD_MODEL;
}

function isAllowedOllamaCloudModel(modelId, catalogIds = VERIFIED_OLLAMA_CLOUD_MODELS) {
    const id = String(modelId || '').trim();
    if (!id) return false;
    const set = new Set((catalogIds || []).map((item) => String(item).trim()));
    return set.has(id);
}

/**
 * List models from Ollama Cloud OpenAI-compatible API.
 * Falls back to the verified static catalog when the request fails.
 */
async function listOllamaCloudModels({ timeoutMs = 8000 } = {}) {
    const key = getOllamaApiKey();
    try {
        const headers = { Accept: 'application/json' };
        if (key) headers.Authorization = `Bearer ${key}`;
        const response = await fetch(ollamaCloudModelsUrl(), {
            method: 'GET',
            headers,
            signal: AbortSignal.timeout(timeoutMs),
        });
        if (!response.ok) {
            return {
                online: false,
                configured: Boolean(key),
                status: response.status,
                models: VERIFIED_OLLAMA_CLOUD_MODELS.map((id) => ({ id, source: 'verified_catalog' })),
                message: `Ollama Cloud /models returned ${response.status}`,
            };
        }
        const data = await response.json();
        const rows = Array.isArray(data?.data) ? data.data : Array.isArray(data?.models) ? data.models : [];
        const models = rows
            .map((row) => ({
                id: String(row.id || row.name || '').trim(),
                ownedBy: row.owned_by || null,
                created: row.created || null,
                source: 'ollama_cloud',
            }))
            .filter((row) => row.id);
        return {
            online: true,
            configured: Boolean(key),
            mode: 'cloud',
            baseUrl: getOllamaCloudBaseUrl(),
            models: models.length
                ? models
                : VERIFIED_OLLAMA_CLOUD_MODELS.map((id) => ({ id, source: 'verified_catalog' })),
        };
    } catch (error) {
        return {
            online: false,
            configured: Boolean(key),
            models: VERIFIED_OLLAMA_CLOUD_MODELS.map((id) => ({ id, source: 'verified_catalog' })),
            message: sanitizeProviderHint(error.message, 160) || 'Ollama Cloud models unavailable',
            code: 'OLLAMA_CLOUD_UNAVAILABLE',
        };
    }
}

function mapOllamaCloudHttpError(status, detail = '') {
    const text = sanitizeProviderHint(detail, 240) || String(detail || '').trim();
    const code = Number(status) || 0;
    if (code === 401 || code === 403) {
        return {
            code: 'OLLAMA_CLOUD_AUTH_FAILED',
            clientStatus: 502,
            message: 'Ollama Cloud rejected the server API key. Verify OLLAMA_API_KEY on the backend and redeploy.',
        };
    }
    if (code === 429) {
        return {
            code: 'OLLAMA_CLOUD_RATE_LIMITED',
            clientStatus: 429,
            message: 'Ollama Cloud rate limit reached. Wait a moment and retry, or choose another model.',
        };
    }
    if (code === 400 || code === 422) {
        return {
            code: 'OLLAMA_CLOUD_INVALID_REQUEST',
            clientStatus: 400,
            message: text || 'Ollama Cloud could not process this request. Check the selected model version.',
        };
    }
    if (code === 404) {
        return {
            code: 'OLLAMA_CLOUD_MODEL_NOT_FOUND',
            clientStatus: 502,
            message: 'The selected Ollama Cloud model is not available. Pick another Ollama version.',
        };
    }
    if (code === 408 || code === 504) {
        return {
            code: 'OLLAMA_CLOUD_TIMEOUT',
            clientStatus: 504,
            message: 'Ollama Cloud timed out. Retry or choose a faster model.',
        };
    }
    if (code >= 500) {
        return {
            code: 'OLLAMA_CLOUD_UPSTREAM',
            clientStatus: 502,
            message: 'Ollama Cloud is temporarily unavailable. Retry in a few seconds.',
        };
    }
    if (code > 0) {
        return {
            code: 'OLLAMA_CLOUD_UPSTREAM',
            clientStatus: code >= 400 && code < 600 ? code : 502,
            message: text || 'Ollama Cloud could not complete this request.',
        };
    }
    return null;
}

function logOllamaCloudHttpError(status, responseData, context = {}) {
    const detail = sanitizeProviderHint(
        responseData?.error?.message || responseData?.message || '',
        200,
    );
    console.error('[OLLAMA_CLOUD ERROR]', {
        status: Number(status) || 0,
        message: detail || '(no upstream message)',
        model: context.model || null,
        correlationId: context.correlationId || null,
    });
}

module.exports = {
    DEFAULT_OLLAMA_CLOUD_BASE,
    DEFAULT_OLLAMA_CLOUD_MODEL,
    VERIFIED_OLLAMA_CLOUD_MODELS,
    getOllamaApiKey,
    getOllamaCloudBaseUrl,
    isOllamaCloudConfigured,
    ollamaCloudChatCompletionsUrl,
    ollamaCloudModelsUrl,
    resolveOllamaCloudModel,
    isAllowedOllamaCloudModel,
    listOllamaCloudModels,
    mapOllamaCloudHttpError,
    logOllamaCloudHttpError,
};
