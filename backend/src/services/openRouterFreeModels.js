/**
 * OpenRouter :free models.
 * Prefer dedicated free-model keys; Nemotron may reuse the shared OPENROUTER_API_KEY.
 * Paid OpenRouter model IDs are never selected for these slugs.
 */

const { getOpenRouterApiKey, getOpenRouterKeySourceEnvName } = require('../openRouterConfig');

const OPENROUTER_CHAT_COMPLETIONS_URL = 'https://openrouter.ai/api/v1/chat/completions';

const NEMOTRON_FREE_MODEL = 'nvidia/nemotron-3-ultra-550b-a55b:free';
const DEEPSEEK_R1_FREE_MODEL = 'deepseek/deepseek-r1-0528:free';

const OPENROUTER_CHAT_FREE_KEY_ENV = 'OPENROUTER_CHAT_FREE_API_KEY';
const OPENROUTER_DEEPSEEK_FREE_KEY_ENV = 'OPENROUTER_DEEPSEEK_FREE_API_KEY';
const DEEPSEEK_FREE_OPENROUTER_KEY_LEGACY_ENV = 'AllModelAI-DeepSeek-Free-v2';

/**
 * @type {Record<string, {
 *   slug: string,
 *   modelId: string,
 *   keyEnv: string,
 *   legacyKeyEnvs?: string[],
 *   displayName: string,
 *   allowSharedOpenRouterKey?: boolean,
 * }>}
 */
const OPENROUTER_FREE_BY_SLUG = {
    nemotron: {
        slug: 'nemotron',
        modelId: NEMOTRON_FREE_MODEL,
        keyEnv: OPENROUTER_CHAT_FREE_KEY_ENV,
        displayName: 'NVIDIA Nemotron 3 Ultra (Free)',
        // Shared OpenRouter key is allowed; requests still use the :free model id only.
        allowSharedOpenRouterKey: true,
    },
    'deepseek-r1': {
        slug: 'deepseek-r1',
        modelId: DEEPSEEK_R1_FREE_MODEL,
        keyEnv: OPENROUTER_DEEPSEEK_FREE_KEY_ENV,
        legacyKeyEnvs: [DEEPSEEK_FREE_OPENROUTER_KEY_LEGACY_ENV],
        displayName: 'DeepSeek R1 (Free)',
        allowSharedOpenRouterKey: false,
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

function resolveOpenRouterFreeApiKey(config) {
    const dedicated = getDedicatedOpenRouterFreeKey(config);
    if (dedicated) {
        return {
            apiKey: dedicated,
            keySourceEnv: envTrim(config.keyEnv)
                ? config.keyEnv
                : (config.legacyKeyEnvs || []).find((name) => envTrim(name)) || config.keyEnv,
        };
    }
    if (config.allowSharedOpenRouterKey) {
        const shared = getOpenRouterApiKey();
        if (shared) {
            return {
                apiKey: shared,
                keySourceEnv: getOpenRouterKeySourceEnvName() || 'OPENROUTER_API_KEY',
            };
        }
    }
    return { apiKey: '', keySourceEnv: null };
}

function getOpenRouterFreeKeySourceEnvName(slug) {
    const config = OPENROUTER_FREE_BY_SLUG[slug];
    if (!config) return null;
    return resolveOpenRouterFreeApiKey(config).keySourceEnv;
}

function isOpenRouterFreeSlug(slug) {
    return Boolean(OPENROUTER_FREE_BY_SLUG[String(slug || '').trim()]);
}

function isOpenRouterFreeConfigured(slug) {
    const config = OPENROUTER_FREE_BY_SLUG[String(slug || '').trim()];
    if (!config) return false;
    return Boolean(resolveOpenRouterFreeApiKey(config).apiKey);
}

/**
 * @returns {{ slug: string, modelId: string, apiKey: string, keySourceEnv: string, displayName: string } | null}
 */
function resolveOpenRouterFreeRoute(slug) {
    const key = String(slug || '').trim();
    const config = OPENROUTER_FREE_BY_SLUG[key];
    if (!config) return null;
    const resolved = resolveOpenRouterFreeApiKey(config);
    if (!resolved.apiKey) return null;
    return {
        slug: config.slug,
        // Always the free id — never a paid Nemotron/DeepSeek OpenRouter route.
        modelId: config.modelId,
        apiKey: resolved.apiKey,
        keySourceEnv: resolved.keySourceEnv,
        displayName: config.displayName,
    };
}

function resolveOpenRouterFreeModelId(slug, variantGatewayOrDirect) {
    const route = OPENROUTER_FREE_BY_SLUG[String(slug || '').trim()];
    if (!route) return String(variantGatewayOrDirect || '').trim();
    const fromVariant = String(variantGatewayOrDirect || '').trim();
    // Accept only :free variants; never upgrade a free slug to a paid OpenRouter id.
    if (fromVariant.includes(':free')) return fromVariant;
    return route.modelId;
}

/**
 * @returns {{ message: string, code: string, clientStatus: number, retryable: boolean }}
 */
function mapOpenRouterFreeHttpError(httpStatus, detailMessage = '') {
    const status = Number(httpStatus) || 0;
    const detail = String(detailMessage || '').toLowerCase();

    if (status === 401 || /unauthorized|invalid.*api.*key|authentication/i.test(detail)) {
        return {
            message: 'OpenRouter rejected the free-model API key. Verify OPENROUTER_CHAT_FREE_API_KEY or OPENROUTER_API_KEY on the server.',
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
    const dedicated = config?.keyEnv || 'OPENROUTER_*_FREE_API_KEY';
    const hint = config?.allowSharedOpenRouterKey
        ? `Set ${dedicated} or OPENROUTER_API_KEY on the server (backend only). Free-tier availability and rate limits still apply.`
        : `Set ${dedicated} on the server (backend only).`;
    return {
        message: `${config?.displayName || slug} is not configured. ${hint}`,
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
