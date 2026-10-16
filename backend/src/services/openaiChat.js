'use strict';

const { sanitizeProviderHint } = require('./providerErrorClassification');

const OPENAI_CHAT_COMPLETIONS_URL = 'https://api.openai.com/v1/chat/completions';
/** Default text model when no GPT variant is selected. Matches GPT-4.1 Mini catalog. */
const DEFAULT_OPENAI_CHAT_MODEL = 'gpt-4.1-mini';

function resolveOpenAiDirectModel(selectedVariant, { hasAttachedImage = false } = {}) {
    if (selectedVariant?.direct) return String(selectedVariant.direct).trim();
    if (hasAttachedImage) {
        const { resolveOpenAiVisionModel } = require('./visionSupport');
        return resolveOpenAiVisionModel();
    }
    const configured = String(process.env.OPENAI_MODEL || process.env.OPEN_AI_MODEL || '').trim();
    return configured || DEFAULT_OPENAI_CHAT_MODEL;
}

/**
 * Map OpenAI HTTP failures to safe client messages.
 * Distinguishes rate limits from insufficient quota (both may be HTTP 429).
 */
function mapOpenAiHttpError(status, detail = '') {
    const text = sanitizeProviderHint(detail, 240) || String(detail || '').trim();
    const lower = text.toLowerCase();
    const code = Number(status) || 0;

    if (code === 401) {
        return {
            code: 'OPENAI_AUTH_FAILED',
            clientStatus: 502,
            provider: 'openai',
            message: 'OpenAI rejected the server API key. Verify OPENAI_API_KEY on the backend and redeploy.',
        };
    }
    if (code === 403) {
        return {
            code: 'OPENAI_FORBIDDEN',
            clientStatus: 502,
            provider: 'openai',
            message: 'OpenAI denied access for this key or model. Check project permissions and model availability.',
        };
    }
    if (code === 429) {
        const quota = /insufficient_quota|exceeded.*quota|billing|no credits|payment|you exceeded your current quota/i.test(lower);
        if (quota) {
            return {
                code: 'OPENAI_INSUFFICIENT_QUOTA',
                clientStatus: 402,
                provider: 'openai',
                message: 'OpenAI reports insufficient quota for this account. Add billing/credits in the OpenAI dashboard, or choose another configured model.',
            };
        }
        return {
            code: 'OPENAI_RATE_LIMITED',
            clientStatus: 429,
            provider: 'openai',
            message: 'OpenAI rate limit reached. Wait a moment and retry, or choose another model.',
        };
    }
    if (code === 400 || code === 422) {
        return {
            code: 'OPENAI_INVALID_REQUEST',
            clientStatus: 400,
            provider: 'openai',
            message: text || 'OpenAI could not process this request. Check the selected GPT version.',
        };
    }
    if (code === 404) {
        return {
            code: 'OPENAI_MODEL_NOT_FOUND',
            clientStatus: 502,
            provider: 'openai',
            message: 'The selected OpenAI model is not available for this key. Pick another GPT version or update OPENAI_MODEL.',
        };
    }
    if (code === 500 || code === 503 || code >= 500) {
        return {
            code: 'OPENAI_UPSTREAM',
            clientStatus: 502,
            provider: 'openai',
            message: 'OpenAI is temporarily unavailable. Retry in a few seconds.',
        };
    }
    if (code > 0) {
        return {
            code: 'OPENAI_UPSTREAM',
            clientStatus: code >= 400 && code < 600 ? code : 502,
            provider: 'openai',
            message: text || 'OpenAI could not complete this request.',
        };
    }
    return null;
}

function logOpenAiHttpError(status, responseData, context = {}) {
    const detail = String(responseData?.error?.message || responseData?.message || '').slice(0, 200);
    console.error('[OPENAI ERROR]', {
        status: Number(status) || 0,
        message: detail || '(no upstream message)',
        model: context.model || null,
        routedModel: context.routedModel || null,
        correlationId: context.correlationId || null,
    });
}

module.exports = {
    OPENAI_CHAT_COMPLETIONS_URL,
    DEFAULT_OPENAI_CHAT_MODEL,
    resolveOpenAiDirectModel,
    mapOpenAiHttpError,
    logOpenAiHttpError,
};
