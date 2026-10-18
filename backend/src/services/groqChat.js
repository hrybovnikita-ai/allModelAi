const { sanitizeEnvSecret } = require('../openRouterConfig');
const { sanitizeProviderHint } = require('./providerErrorClassification');

const GROQ_CHAT_COMPLETIONS_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODELS_URL = 'https://api.groq.com/openai/v1/models';
const DEFAULT_GROQ_MODEL = 'llama-3.3-70b-versatile';

/** Open-weight GPT-OSS 120B on GroqCloud — not OpenAI GPT-4.1 and not Cloudflare GPT-OSS. */
const GPT_OSS_GROQ_SLUG = 'gpt-oss-groq';
const GPT_OSS_GROQ_MODEL_ID = 'openai/gpt-oss-120b';
const GPT_OSS_GROQ_DISPLAY_NAME = 'GPT-OSS 120B — Groq';
const GPT_OSS_GROQ_PROVIDER_LABEL = 'GroqCloud';

function envTrim(name) {
    return sanitizeEnvSecret(process.env[name]);
}

function getGroqApiKey() {
    return envTrim('GROQ_API_KEY');
}

function isGroqConfigured() {
    return Boolean(getGroqApiKey());
}

function isGptOssGroqSlug(routedModel) {
    return String(routedModel || '').trim().toLowerCase() === GPT_OSS_GROQ_SLUG;
}

function isGroqFamilySlug(routedModel) {
    const slug = String(routedModel || '').trim().toLowerCase();
    return slug === 'groq' || slug === GPT_OSS_GROQ_SLUG;
}

/**
 * Direct GroqCloud path for Llama (groq) and GPT-OSS 120B (gpt-oss-groq).
 * Never uses OpenRouter when GROQ_PROVIDER=openrouter for gpt-oss-groq.
 */
function shouldUseGroqDirect(routedModel) {
    const slug = String(routedModel || '').trim().toLowerCase();
    if (!isGroqConfigured()) return false;
    if (slug === GPT_OSS_GROQ_SLUG) return true;
    if (slug !== 'groq') return false;
    if (envTrim('GROQ_PROVIDER') === 'openrouter') return false;
    return true;
}

function resolveGroqDirectModel(selectedVariant, routedModel = 'groq') {
    if (isGptOssGroqSlug(routedModel)) {
        if (selectedVariant?.direct) {
            const direct = String(selectedVariant.direct).trim();
            if (direct === GPT_OSS_GROQ_MODEL_ID || direct.endsWith('gpt-oss-120b')) {
                return GPT_OSS_GROQ_MODEL_ID;
            }
        }
        return GPT_OSS_GROQ_MODEL_ID;
    }
    if (selectedVariant?.direct) return selectedVariant.direct;
    const gateway = String(selectedVariant?.gateway || '').trim();
    if (gateway.startsWith('groq/')) return gateway.slice('groq/'.length);
    return envTrim('GROQ_MODEL') || DEFAULT_GROQ_MODEL;
}

function mapGroqHttpError(status, detail = '') {
    const text = sanitizeProviderHint(detail, 240) || String(detail || '').trim();
    const lower = text.toLowerCase();
    const code = Number(status) || 0;

    if (code === 401 || code === 403) {
        return {
            code: 'GROQ_AUTH_FAILED',
            clientStatus: 502,
            provider: 'groq',
            message: 'Groq rejected the server API key. Verify GROQ_API_KEY on the backend and redeploy.',
        };
    }
    if (code === 402 || /insufficient.?quota|quota.?exceeded|free.?tier|out of credits|billing|payment required/i.test(lower)) {
        return {
            code: 'GROQ_QUOTA_EXHAUSTED',
            clientStatus: 402,
            provider: 'groq',
            message: 'Groq reports insufficient quota or free-tier allowance for this account. Wait for the quota reset or choose another configured model.',
        };
    }
    if (code === 429) {
        const quota = /insufficient.?quota|quota.?exceeded|free.?tier|credits|billing/i.test(lower);
        if (quota) {
            return {
                code: 'GROQ_QUOTA_EXHAUSTED',
                clientStatus: 402,
                provider: 'groq',
                message: 'Groq free-tier quota is exhausted. Wait for the reset or choose another configured model.',
            };
        }
        return {
            code: 'GROQ_RATE_LIMITED',
            clientStatus: 429,
            provider: 'groq',
            message: 'Groq rate limit reached. Wait a moment and retry, or choose another model.',
        };
    }
    if (code === 400 || code === 422) {
        return {
            code: 'GROQ_INVALID_REQUEST',
            clientStatus: 400,
            provider: 'groq',
            message: text || 'Groq could not process this request. Check the selected model version.',
        };
    }
    if (code === 404) {
        return {
            code: 'GROQ_MODEL_NOT_FOUND',
            clientStatus: 502,
            provider: 'groq',
            message: 'The selected Groq model is not available. Pick another Groq version or update the model id.',
        };
    }
    if (code >= 500) {
        return {
            code: 'GROQ_UPSTREAM',
            clientStatus: 502,
            provider: 'groq',
            message: 'Groq is temporarily unavailable. Retry in a few seconds.',
        };
    }
    if (code > 0) {
        return {
            code: 'GROQ_UPSTREAM',
            clientStatus: code >= 400 && code < 600 ? code : 502,
            provider: 'groq',
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
        routedModel: context.routedModel || null,
        correlationId: context.correlationId || null,
    });
}

module.exports = {
    DEFAULT_GROQ_MODEL,
    GPT_OSS_GROQ_DISPLAY_NAME,
    GPT_OSS_GROQ_MODEL_ID,
    GPT_OSS_GROQ_PROVIDER_LABEL,
    GPT_OSS_GROQ_SLUG,
    GROQ_CHAT_COMPLETIONS_URL,
    GROQ_MODELS_URL,
    getGroqApiKey,
    isGptOssGroqSlug,
    isGroqConfigured,
    isGroqFamilySlug,
    logGroqHttpError,
    mapGroqHttpError,
    resolveGroqDirectModel,
    shouldUseGroqDirect,
};
