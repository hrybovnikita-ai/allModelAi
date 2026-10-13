/**
 * OpenRouter :free models with dedicated API keys (no fallback to paid OpenRouter keys).
 */

const OPENROUTER_CHAT_COMPLETIONS_URL = 'https://openrouter.ai/api/v1/chat/completions';

const NEMOTRON_FREE_MODEL = 'nvidia/nemotron-3-ultra-550b-a55b:free';
const DEEPSEEK_R1_FREE_MODEL = 'deepseek/deepseek-r1-0528:free';

const OPENROUTER_CHAT_FREE_KEY_ENV = 'OPENROUTER_CHAT_FREE_API_KEY';
const OPENROUTER_DEEPSEEK_FREE_KEY_ENV = 'OPENROUTER_DEEPSEEK_FREE_API_KEY';
const DEEPSEEK_FREE_OPENROUTER_KEY_LEGACY_ENV = 'AllModelAI-DeepSeek-Free-v2';

/** @type {Record<string, { slug: string, modelId: string, keyEnv: string, legacyKeyEnvs?: string[], displayName: string }>} */
const OPENROUTER_FREE_BY_SLUG = {
    nemotron: {
        slug: 'nemotron',
        modelId: NEMOTRON_FREE_MODEL,
        keyEnv: OPENROUTER_CHAT_FREE_KEY_ENV,
        displayName: 'Nemotron 3 Ultra (Free)',
    },
    'deepseek-r1': {
        slug: 'deepseek-r1',
        modelId: DEEPSEEK_R1_FREE_MODEL,
        keyEnv: OPENROUTER_DEEPSEEK_FREE_KEY_ENV,
        legacyKeyEnvs: [DEEPSEEK_FREE_OPENROUTER_KEY_LEGACY_ENV],
        displayName: 'DeepSeek R1 (Free)',
    },
};

function envTrim(name) {
    return String(process.env[name] || '').trim();
}

function getDedicatedOpenRouterFreeKey(config) {
    if (!config) return '';
    const primary = envTrim(config.keyEnv);
    if (primary) return primary;
    for (const legacy of config.legacyKeyEnvs || []) {
        const value = envTrim(legacy);
        if (value) return value;
    }
    return '';
}

function getOpenRouterFreeKeySourceEnvName(slug) {
    const config = OPENROUTER_FREE_BY_SLUG[slug];
    if (!config) return null;
    if (envTrim(config.keyEnv)) return config.keyEnv;
    for (const legacy of config.legacyKeyEnvs || []) {
        if (envTrim(legacy)) return legacy;
    }
    return null;
}

function isOpenRouterFreeSlug(slug) {
    return Boolean(OPENROUTER_FREE_BY_SLUG[String(slug || '').trim()]);
}

function isOpenRouterFreeConfigured(slug) {
    const config = OPENROUTER_FREE_BY_SLUG[String(slug || '').trim()];
    if (!config) return false;
    return Boolean(getDedicatedOpenRouterFreeKey(config));
}

/**
 * @returns {{ slug: string, modelId: string, apiKey: string, keySourceEnv: string, displayName: string } | null}
 */
function resolveOpenRouterFreeRoute(slug) {
    const key = String(slug || '').trim();
    const config = OPENROUTER_FREE_BY_SLUG[key];
    if (!config) return null;
    const apiKey = getDedicatedOpenRouterFreeKey(config);
    if (!apiKey) return null;
    return {
        slug: config.slug,
        modelId: config.modelId,
        apiKey,
        keySourceEnv: getOpenRouterFreeKeySourceEnvName(key),
        displayName: config.displayName,
    };
}

function resolveOpenRouterFreeModelId(slug, variantGatewayOrDirect) {
    const route = OPENROUTER_FREE_BY_SLUG[String(slug || '').trim()];
    const fromVariant = String(variantGatewayOrDirect || '').trim();
    if (fromVariant.includes(':free')) return fromVariant;
    return route?.modelId || fromVariant;
}

/**
 * @returns {{ message: string, code: string, clientStatus: number, retryable: boolean }}
 */
function mapOpenRouterFreeHttpError(httpStatus, detailMessage = '') {
    const status = Number(httpStatus) || 0;
    const detail = String(detailMessage || '').toLowerCase();

    if (status === 401 || /unauthorized|invalid.*api.*key|authentication/i.test(detail)) {
        return {
            message: 'OpenRouter rejected the free-model API key. Verify the dedicated key env var on the server.',
            code: 'OPENROUTER_FREE_AUTH_FAILED',
            clientStatus: 401,
            retryable: false,
        };
    }
    if (status === 402 || /insufficient credits|requires more credits|payment|billing|afford/i.test(detail)) {
        return {
            message: 'OpenRouter free-model credits are exhausted or this key cannot spend on the requested model. Add credits or use a :free model ID only — paid models are not used automatically.',
            code: 'OPENROUTER_FREE_CREDITS',
            clientStatus: 402,
            retryable: false,
        };
    }
    if (status === 403 || /forbidden|not allowed|access denied|moderation/i.test(detail)) {
        return {
            message: 'OpenRouter denied access to this free model for your key or region.',
            code: 'OPENROUTER_FREE_FORBIDDEN',
            clientStatus: 403,
            retryable: false,
        };
    }
    if (status === 429 || /rate limit|too many requests/i.test(detail)) {
        return {
            message: 'OpenRouter rate limit reached for the free model. Wait and try again.',
            code: 'OPENROUTER_FREE_RATE_LIMITED',
            clientStatus: 429,
            retryable: true,
        };
    }
    if (status === 404 || /model not found|does not exist|invalid model/i.test(detail)) {
        return {
            message: 'The configured OpenRouter free model ID is not available. Check the model slug on OpenRouter.',
            code: 'OPENROUTER_FREE_MODEL_UNAVAILABLE',
            clientStatus: 503,
            retryable: false,
        };
    }
    if (status === 504 || /timeout|timed out/i.test(detail)) {
        return {
            message: 'OpenRouter took too long to respond. Try again.',
            code: 'OPENROUTER_FREE_TIMEOUT',
            clientStatus: 504,
            retryable: true,
        };
    }
    if (status >= 500) {
        return {
            message: 'OpenRouter is temporarily unavailable for this free model.',
            code: 'OPENROUTER_FREE_UPSTREAM',
            clientStatus: 502,
            retryable: true,
        };
    }
    return {
        message: 'OpenRouter could not complete this free-model request.',
        code: 'OPENROUTER_FREE_FAILED',
        clientStatus: status >= 400 && status < 600 ? status : 502,
        retryable: status >= 500,
    };
}

function missingOpenRouterFreeConfigPayload(slug) {
    const config = OPENROUTER_FREE_BY_SLUG[String(slug || '').trim()];
    const envName = config?.keyEnv || 'OPENROUTER_*_FREE_API_KEY';
    return {
        message: `${config?.displayName || slug} is not configured. Set ${envName} on the server (backend only).`,
        code: 'OPENROUTER_FREE_NOT_CONFIGURED',
    };
}

module.exports = {
    DEEPSEEK_R1_FREE_MODEL,
    DEEPSEEK_FREE_OPENROUTER_KEY_LEGACY_ENV,
    NEMOTRON_FREE_MODEL,
    OPENROUTER_CHAT_COMPLETIONS_URL,
    OPENROUTER_CHAT_FREE_KEY_ENV,
    OPENROUTER_DEEPSEEK_FREE_KEY_ENV,
    OPENROUTER_FREE_BY_SLUG,
    getDedicatedOpenRouterFreeKey,
    getOpenRouterFreeKeySourceEnvName,
    isOpenRouterFreeConfigured,
    isOpenRouterFreeSlug,
    mapOpenRouterFreeHttpError,
    missingOpenRouterFreeConfigPayload,
    resolveOpenRouterFreeModelId,
    resolveOpenRouterFreeRoute,
};
