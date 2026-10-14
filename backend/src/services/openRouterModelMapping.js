const { upstreamErrorMessage } = require('../modelProviderEquivalence');

/** Known-good OpenRouter ids when catalog slugs are unavailable on the account. */
const OPENROUTER_GATEWAY_ALIASES = {
    'openai/gpt-4.1-mini': 'openai/gpt-4o-mini',
    'openai/gpt-4.1-nano': 'openai/gpt-4o-mini',
    'openai/gpt-4.1': 'openai/gpt-4o',
    'mistral-small-latest': 'mistralai/mistral-small-3.1-24b-instruct',
};

const DEFAULT_OPENROUTER_GPT = () => String(process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini').trim();

function normalizeOpenRouterGatewayModel(gatewayModel, routedModel = '') {
    const raw = String(gatewayModel || '').trim();
    if (!raw) {
        if (routedModel === 'gpt' || routedModel === 'copilot') return DEFAULT_OPENROUTER_GPT();
        return raw;
    }
    const alias = OPENROUTER_GATEWAY_ALIASES[raw.toLowerCase()] || OPENROUTER_GATEWAY_ALIASES[raw];
    if (alias) return alias;
    if (/^mistral-/i.test(raw) && !raw.includes('/')) {
        return OPENROUTER_GATEWAY_ALIASES['mistral-small-latest'];
    }
    return raw;
}

function isOpenRouterRecoverableFailure(status, detail = '') {
    const code = Number(status) || 0;
    const text = String(detail || '').toLowerCase();
    if (code === 401 || code === 403) return true;
    if (code === 404 && /model|endpoint|not found|does not exist|invalid model/i.test(text)) return true;
    const authOrModelText = /invalid.*api.*key|incorrect api key|unauthorized|authentication|permission|forbidden|model.*not.*found|no endpoints found|provider returned error|rejected the server credentials|model access|not allowed to access/i.test(text);
    if (authOrModelText) return true;
    if ((code === 502 || code === 503) && authOrModelText) return true;
    return false;
}

function parseRecoveryModelList(envValue, defaults) {
    const fromEnv = String(envValue || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    return fromEnv.length ? fromEnv : defaults;
}

/**
 * Models to try after auth/access/upstream failures on OpenRouter (deduped, primary remap first).
 */
function getOpenRouterRecoveryModelCandidates({
    primary,
    failedModel = '',
    routedModel = '',
    hasAttachedImage = false,
} = {}) {
    const normalizedPrimary = normalizeOpenRouterGatewayModel(primary, routedModel);
    const failed = String(failedModel || normalizedPrimary || '').trim();
    const freeDefaults = hasAttachedImage
        ? ['openai/gpt-4o-mini', 'google/gemini-2.5-flash']
        : [
            String(process.env.OPENROUTER_FREE_MODEL || 'openrouter/free').trim(),
            'meta-llama/llama-3.3-70b-instruct:free',
            'openai/gpt-4o-mini',
        ];
    const configured = parseRecoveryModelList(process.env.OPENROUTER_RECOVERY_MODELS, freeDefaults);
    const ordered = [...configured];
    if (normalizedPrimary && normalizedPrimary !== failed && !ordered.includes(normalizedPrimary)) {
        ordered.unshift(normalizedPrimary);
    }
    return [...new Set(ordered.filter((item) => item && item !== failed))];
}

function logOpenRouterHttpError(status, responseData, context = {}) {
    const detail = upstreamErrorMessage(responseData);
    console.error('[OPENROUTER ERROR]', {
        status: Number(status) || 0,
        message: detail || '(no upstream message)',
        model: context.gatewayModel || context.recoveryModel || context.model || null,
        routedModel: context.routedModel || null,
        correlationId: context.correlationId || null,
        upstream: responseData?.error || responseData?.errors || responseData || null,
    });
}

module.exports = {
    DEFAULT_OPENROUTER_GPT,
    OPENROUTER_GATEWAY_ALIASES,
    getOpenRouterRecoveryModelCandidates,
    isOpenRouterRecoverableFailure,
    logOpenRouterHttpError,
    normalizeOpenRouterGatewayModel,
};
