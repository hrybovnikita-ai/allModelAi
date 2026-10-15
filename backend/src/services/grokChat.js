const { sanitizeEnvSecret } = require('../openRouterConfig');
const { sanitizeProviderHint } = require('./providerErrorClassification');

const XAI_CHAT_COMPLETIONS_URL = 'https://api.x.ai/v1/chat/completions';
const DEFAULT_GROK_DIRECT_MODEL = 'grok-4.3';
const DEFAULT_GROK_OPENROUTER_GATEWAY = 'x-ai/grok-4.3';

function envTrim(name) {
    return sanitizeEnvSecret(process.env[name]);
}

function isOpenRouterStyleApiKey(key) {
    return /^sk-or-/i.test(String(key || '').trim());
}

function grokProviderMode() {
    return String(envTrim('GROK_PROVIDER') || '').toLowerCase();
}

function getGrokDirectApiKey() {
    const xai = envTrim('XAI_API_KEY');
    const grok = envTrim('GROK_API_KEY');
    if (xai && !isOpenRouterStyleApiKey(xai)) return xai;
    if (grok && !isOpenRouterStyleApiKey(grok)) return grok;
    return '';
}

function shouldUseGrokDirect(routedModel) {
    if (String(routedModel || '').trim().toLowerCase() !== 'grok') return false;
    if (grokProviderMode() === 'openrouter') return false;
    return Boolean(getGrokDirectApiKey());
}

function normalizeXaiDirectModelId(raw) {
    let id = String(raw || '').trim();
    if (!id) return DEFAULT_GROK_DIRECT_MODEL;
    while (id.startsWith('~')) id = id.slice(1);
    if (/^x-ai\//i.test(id)) id = id.replace(/^x-ai\//i, '');
    return id || DEFAULT_GROK_DIRECT_MODEL;
}

function normalizeGrokOpenRouterGateway(raw) {
    let id = String(raw || '').trim();
    if (!id) return DEFAULT_GROK_OPENROUTER_GATEWAY;
    if (id.startsWith('~')) id = id.slice(1);
    return id;
}

function resolveGrokReasoningEffort(selectedVariant) {
    const variantId = String(selectedVariant?.id || '').trim();
    if (variantId === '4.6') return 'high';
    if (variantId === '4.3') return 'medium';
    return undefined;
}

function resolveGrokDirectModel(selectedVariant) {
    if (selectedVariant?.direct) {
        return normalizeXaiDirectModelId(selectedVariant.direct);
    }
    const configured = envTrim('XAI_MODEL') || envTrim('GROK_MODEL');
    if (configured) return normalizeXaiDirectModelId(configured);
    return DEFAULT_GROK_DIRECT_MODEL;
}

function resolveGrokOpenRouterGateway({ selectedVariant, configuredGrokModel, fallbackGateway } = {}) {
    if (selectedVariant?.gateway) {
        return normalizeGrokOpenRouterGateway(selectedVariant.gateway);
    }
    if (configuredGrokModel && !/grok-3-mini/i.test(configuredGrokModel)) {
        return normalizeGrokOpenRouterGateway(configuredGrokModel);
    }
    return normalizeGrokOpenRouterGateway(fallbackGateway || DEFAULT_GROK_OPENROUTER_GATEWAY);
}

function buildGrokDirectRequestBody({ model, systemPrompt, standardInput, outputTokenLimit, selectedVariant }) {
    const reasoningEffort = resolveGrokReasoningEffort(selectedVariant);
    const body = {
        model: normalizeXaiDirectModelId(model),
        stream: true,
        max_completion_tokens: outputTokenLimit,
        messages: [{ role: 'system', content: systemPrompt }, ...standardInput],
    };
    if (reasoningEffort) {
        body.reasoning_effort = reasoningEffort;
    }
    return body;
}

function grokUpstreamDetail(responseData) {
    return sanitizeProviderHint(
        responseData?.error?.message
            || responseData?.error
            || responseData?.message
            || '',
        240,
    );
}

function shouldAttemptGrokOpenRouterRecovery(status, detail = '') {
    const code = Number(status) || 0;
    const text = String(detail || '').toLowerCase();
    if (code === 401 || code === 403 || code === 404) return true;
    if (code === 400) {
        return /model|invalid|not found|does not exist|unsupported|argument|parameter|api key|authentication|authorization/i.test(text);
    }
    return false;
}

function mapGrokHttpError(status, detail = '') {
    const text = sanitizeProviderHint(detail, 240) || String(detail || '').trim();
    const code = Number(status) || 0;
    if (code === 401 || code === 403) {
        return {
            code: 'GROK_AUTH_FAILED',
            clientStatus: 502,
            message: 'Grok (xAI) rejected the server API key. Use a valid XAI_API_KEY on the backend, or set GROK_PROVIDER=openrouter to route Grok through OpenRouter.',
        };
    }
    if (code === 429) {
        return {
            code: 'GROK_RATE_LIMITED',
            clientStatus: 429,
            message: 'Grok rate limit reached. Wait a moment and retry, or choose another model.',
        };
    }
    if (code === 400 || code === 422) {
        return {
            code: 'GROK_INVALID_REQUEST',
            clientStatus: 400,
            message: text
                ? `Grok (xAI) could not process this request: ${text}`
                : 'Grok (xAI) rejected the request. Verify the selected Grok version (4.3 / 4.6) and server model configuration.',
        };
    }
    if (code === 404) {
        return {
            code: 'GROK_MODEL_NOT_FOUND',
            clientStatus: 502,
            message: 'The selected Grok model is not available on xAI. Try another Grok version or configure GROK_PROVIDER=openrouter.',
        };
    }
    if (code >= 500) {
        return {
            code: 'GROK_UPSTREAM',
            clientStatus: 502,
            message: 'Grok (xAI) is temporarily unavailable. Retry in a few seconds.',
        };
    }
    if (code > 0) {
        return {
            code: 'GROK_UPSTREAM',
            clientStatus: code >= 400 && code < 600 ? code : 502,
            message: text || 'Grok (xAI) could not complete this request.',
        };
    }
    return null;
}

function logGrokHttpError(status, responseData, context = {}) {
    console.error('[GROK ERROR]', {
        status: Number(status) || 0,
        message: grokUpstreamDetail(responseData) || '(no upstream message)',
        model: context.model || null,
        route: context.route || null,
        correlationId: context.correlationId || null,
    });
}

module.exports = {
    DEFAULT_GROK_DIRECT_MODEL,
    DEFAULT_GROK_OPENROUTER_GATEWAY,
    XAI_CHAT_COMPLETIONS_URL,
    buildGrokDirectRequestBody,
    getGrokDirectApiKey,
    grokProviderMode,
    grokUpstreamDetail,
    isOpenRouterStyleApiKey,
    logGrokHttpError,
    mapGrokHttpError,
    normalizeGrokOpenRouterGateway,
    normalizeXaiDirectModelId,
    resolveGrokDirectModel,
    resolveGrokOpenRouterGateway,
    shouldAttemptGrokOpenRouterRecovery,
    shouldUseGrokDirect,
};
