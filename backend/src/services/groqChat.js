const { sanitizeEnvSecret } = require('../openRouterConfig');
const { sanitizeProviderHint } = require('./providerErrorClassification');

const GROQ_CHAT_COMPLETIONS_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODELS_URL = 'https://api.groq.com/openai/v1/models';
const DEFAULT_GROQ_MODEL = 'llama-3.3-70b-versatile';

function envTrim(name) {
    return sanitizeEnvSecret(process.env[name]);
}

function getGroqApiKey() {
    return envTrim('GROQ_API_KEY');
}

function isGroqConfigured() {
    return Boolean(getGroqApiKey());
}

function shouldUseGroqDirect(routedModel) {
    if (String(routedModel || '').trim().toLowerCase() !== 'groq') return false;
    if (envTrim('GROQ_PROVIDER') === 'openrouter') return false;
    return isGroqConfigured();
}

function resolveGroqDirectModel(selectedVariant) {
    if (selectedVariant?.direct) return selectedVariant.direct;
    const gateway = String(selectedVariant?.gateway || '').trim();
    if (gateway.startsWith('groq/')) return gateway.slice('groq/'.length);
    return envTrim('GROQ_MODEL') || DEFAULT_GROQ_MODEL;
}

function mapGroqHttpError(status, detail = '') {
    const text = sanitizeProviderHint(detail, 240) || String(detail || '').trim();
    const code = Number(status) || 0;
    if (code === 401 || code === 403) {
        return {
            code: 'GROQ_AUTH_FAILED',
            clientStatus: 502,
            message: 'Groq rejected the server API key. Verify GROQ_API_KEY on the backend and redeploy.',
        };
    }
    if (code === 429) {
        return {
            code: 'GROQ_RATE_LIMITED',
            clientStatus: 429,
            message: 'Groq rate limit reached. Wait a moment and retry, or choose another model.',
        };
    }
    if (code === 400 || code === 422) {
        return {
            code: 'GROQ_INVALID_REQUEST',
            clientStatus: 400,
            message: text || 'Groq could not process this request. Check the selected model version.',
        };
    }
    if (code === 404) {
        return {
            code: 'GROQ_MODEL_NOT_FOUND',
            clientStatus: 502,
            message: 'The selected Groq model is not available. Pick another Groq version or update GROQ_MODEL.',
        };
    }
    if (code >= 500) {
        return {
            code: 'GROQ_UPSTREAM',
            clientStatus: 502,
            message: 'Groq is temporarily unavailable. Retry in a few seconds.',
        };
    }
    if (code > 0) {
        return {
            code: 'GROQ_UPSTREAM',
            clientStatus: code >= 400 && code < 600 ? code : 502,
            message: text || 'Groq could not complete this request.',
        };
    }
    return null;
}

function logGroqHttpError(status, responseData, context = {}) {
    const detail = sanitizeProviderHint(
        responseData?.error?.message || responseData?.message || '',
        200,
    );
    console.error('[GROQ ERROR]', {
        status: Number(status) || 0,
        message: detail || '(no upstream message)',
        model: context.model || null,
        correlationId: context.correlationId || null,
    });
}

module.exports = {
    DEFAULT_GROQ_MODEL,
    GROQ_CHAT_COMPLETIONS_URL,
    GROQ_MODELS_URL,
    getGroqApiKey,
    isGroqConfigured,
    logGroqHttpError,
    mapGroqHttpError,
    resolveGroqDirectModel,
    shouldUseGroqDirect,
};
