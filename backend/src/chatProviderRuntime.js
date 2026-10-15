const {
    SMART_ROUTE_FALLBACK_ORDER,
    isRoutedModelAvailable,
    providerAvailabilityForRouter,
} = require('./providerHealth');
const {
    OPENROUTER_KEY_ENV_NAMES,
    getOpenRouterApiKey,
    isOpenRouterConfigured,
} = require('./openRouterConfig');

const envTrim = (name) => String(process.env[name] || '').trim();

function openRouterKey() {
    return getOpenRouterApiKey();
}

function openAiKey() {
    return envTrim('OPENAI_API_KEY') || envTrim('OPEN_AI_API_KEY');
}

function geminiKey() {
    return envTrim('GEMINI_API_KEY');
}

function claudeKey() {
    return envTrim('CLAUDE_API_KEY');
}

const { getGrokDirectApiKey, grokProviderMode } = require('./services/grokChat');

function xaiKey() {
    return getGrokDirectApiKey();
}

function mistralKey() {
    return envTrim('MISTRAL_API_KEY');
}

function kimiDirectKey() {
    if (envTrim('KIMI_PROVIDER') === 'openrouter') return '';
    return envTrim('KIMI_API_KEY');
}

const { isCloudflareWorkersAiConfigured } = require('./services/cloudflareWorkersAiConfig');
const { isOpenRouterFreeConfigured } = require('./services/openRouterFreeModels');

function cloudflareDirectReady() {
    return isCloudflareWorkersAiConfigured();
}

function perplexityKey() {
    return envTrim('PERPLEXITY_API_KEY');
}

/** Env vars referenced by chat routing (documentation + diagnostics). */
const CHAT_PROVIDER_ENV = {
    openai: { keys: ['OPENAI_API_KEY', 'OPEN_AI_API_KEY'], optional: ['OPENAI_MODEL'] },
    gemini: { keys: ['GEMINI_API_KEY'], optional: ['GEMINI_MODEL', 'PREFER_GEMINI'] },
    claude: { keys: ['CLAUDE_API_KEY'], optional: ['CLAUDE_MODEL'] },
    openrouter: { keys: [...OPENROUTER_KEY_ENV_NAMES], optional: ['OPENROUTER_FALLBACK_MODELS', 'OPENROUTER_FREE_MODEL'] },
    grok: { keys: ['XAI_API_KEY', 'GROK_API_KEY'], optional: ['GROK_MODEL', 'GROK_PROVIDER', 'XAI_MODEL'] },
    groq: { keys: ['GROQ_API_KEY'], optional: ['GROQ_MODEL', 'GROQ_PROVIDER'] },
    mistral: { keys: ['MISTRAL_API_KEY'], optional: ['MISTRAL_MODEL'] },
    kimi: { keys: ['KIMI_API_KEY'], optional: ['KIMI_MODEL', 'KIMI_PROVIDER', 'KIMI_BASE_URL'] },
    cloudflare: {
        keys: ['CLOUDFLARE_API_KEY', 'CLAUDEFLARE_API_KEY', 'CLOUDFLARE_API_TOKEN', 'ChatGPT_API_KEY', 'CLOUDFLARE_ACCOUNT_ID'],
        optional: ['CLOUDFLARE_MODEL', 'CLOUDFLARE_GPT_OSS_MODEL'],
    },
    'gpt-oss': {
        keys: ['ChatGPT_API_KEY', 'CLOUDFLARE_ACCOUNT_ID'],
        optional: ['CLOUDFLARE_GPT_OSS_MODEL', 'CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_API_KEY'],
    },
    perplexity: { keys: ['PERPLEXITY_API_KEY'], optional: ['PERPLEXITY_MODEL'] },
    nemotron: { keys: ['OPENROUTER_CHAT_FREE_API_KEY'], optional: [] },
    'deepseek-r1': { keys: ['OPENROUTER_DEEPSEEK_FREE_API_KEY'], optional: ['AllModelAI-DeepSeek-Free-v2'] },
    tavily: { keys: ['TAVILY_API_KEY'], optional: [] },
};

function isChatProviderConfigured(providerId) {
    const gateway = openRouterKey();
    switch (providerId) {
        case 'openai':
            return Boolean(openAiKey());
        case 'gemini':
            return Boolean(geminiKey());
        case 'claude':
            return Boolean(claudeKey());
        case 'openrouter':
            return isOpenRouterConfigured();
        case 'grok':
            return Boolean(xaiKey()) || Boolean(gateway);
        case 'groq':
            if (envTrim('GROQ_PROVIDER') === 'openrouter') return Boolean(gateway);
            return Boolean(envTrim('GROQ_API_KEY')) || Boolean(gateway);
        case 'mistral':
            return Boolean(mistralKey()) || Boolean(gateway);
        case 'kimi':
            return Boolean(kimiDirectKey()) || Boolean(gateway);
        case 'cloudflare':
            return cloudflareDirectReady() || Boolean(gateway);
        case 'gpt-oss':
            return cloudflareDirectReady();
        case 'nemotron':
            return isOpenRouterFreeConfigured('nemotron');
        case 'deepseek-r1':
            return isOpenRouterFreeConfigured('deepseek-r1');
        case 'perplexity':
            return Boolean(perplexityKey()) || Boolean(gateway);
        case 'tavily':
            return Boolean(envTrim('TAVILY_API_KEY'));
        default:
            return Boolean(gateway);
    }
}

function listConfiguredChatProviderIds() {
    return Object.keys(CHAT_PROVIDER_ENV).filter((id) => isChatProviderConfigured(id));
}

function anyChatProviderConfigured() {
    return listConfiguredChatProviderIds().some((id) => id !== 'tavily');
}

/**
 * True when this routed slug can obtain an API key (direct or via OpenRouter).
 */
function routedModelHasApiKey(routedModel) {
    const gateway = openRouterKey();
    switch (routedModel) {
        case 'gpt':
        case 'copilot':
            return Boolean(openAiKey()) || Boolean(gateway);
        case 'gemini':
            return Boolean(geminiKey()) || Boolean(gateway);
        case 'claude':
            return Boolean(claudeKey()) || Boolean(gateway);
        case 'grok':
            if (grokProviderMode() === 'openrouter') return Boolean(gateway);
            return Boolean(xaiKey()) || Boolean(gateway);
        case 'groq':
            if (envTrim('GROQ_PROVIDER') === 'openrouter') return Boolean(gateway);
            return Boolean(envTrim('GROQ_API_KEY')) || Boolean(gateway);
        case 'mistral':
            return Boolean(mistralKey()) || Boolean(gateway);
        case 'kimi':
            return Boolean(kimiDirectKey()) || Boolean(gateway);
        case 'cloudflare':
            return cloudflareDirectReady() || Boolean(gateway);
        case 'gpt-oss':
            return cloudflareDirectReady();
        case 'nemotron':
            return isOpenRouterFreeConfigured('nemotron');
        case 'deepseek-r1':
            return isOpenRouterFreeConfigured('deepseek-r1');
        case 'perplexity':
            return Boolean(perplexityKey()) || Boolean(gateway);
        case 'deepseek':
        case 'llama':
        case 'qwen':
        case 'cohere':
            return Boolean(gateway);
        default:
            return Boolean(gateway);
    }
}

function providerCircuitAllowsSlug(slug) {
    try {
        const { slugToProviderId } = require('./services/providerErrorClassification');
        const { canAttempt } = require('./services/providerCircuitBreaker');
        const providerId = slugToProviderId(slug) || slug;
        return canAttempt(providerId);
    } catch {
        return true;
    }
}

function findRoutedModelWithApiKey(preferredModel, modelAllowed) {
    const availability = providerAvailabilityForRouter();
    const trySlug = (slug) => modelAllowed(slug)
        && isRoutedModelAvailable(slug, availability)
        && routedModelHasApiKey(slug)
        && providerCircuitAllowsSlug(slug);
    if (trySlug(preferredModel)) return preferredModel;
    for (const candidate of SMART_ROUTE_FALLBACK_ORDER) {
        if (trySlug(candidate)) return candidate;
    }
    return null;
}

function buildNoAiProvidersPayload() {
    return {
        message: 'No AI provider API keys are configured on the server. Add at least GEMINI_API_KEY or ALLMODELAI_OPENROUTER_API_KEY (or OPENROUTER_API_KEY) to Render environment variables, then redeploy the backend.',
        code: 'NO_AI_PROVIDERS',
        configuredProviders: listConfiguredChatProviderIds(),
    };
}

function logAiProviderStatus() {
    for (const providerId of Object.keys(CHAT_PROVIDER_ENV)) {
        const configured = isChatProviderConfigured(providerId);
        console.log(`[AI] provider=${providerId} configured=${configured}`);
    }
}

function logSmartRouter(event, details = {}) {
    const safe = {};
    Object.entries(details).forEach(([key, value]) => {
        if (value === undefined || value === null) return;
        safe[key] = typeof value === 'string' ? value.slice(0, 200) : value;
    });
    const suffix = Object.keys(safe).length ? ` ${JSON.stringify(safe)}` : '';
    console.log(`[SMART_ROUTER] ${event}${suffix}`);
}

module.exports = {
    CHAT_PROVIDER_ENV,
    anyChatProviderConfigured,
    buildNoAiProvidersPayload,
    findRoutedModelWithApiKey,
    isChatProviderConfigured,
    listConfiguredChatProviderIds,
    logAiProviderStatus,
    logSmartRouter,
    openRouterKey,
    routedModelHasApiKey,
};
