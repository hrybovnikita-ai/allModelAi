const { getOpenRouterApiKey, OPENROUTER_KEY_ENV_NAMES } = require('./openRouterConfig');

const configured = (name) => Boolean(String(process.env[name] || '').trim());

function maskConfigured(name) {
    return configured(name) ? 'configured' : 'missing';
}

function providerCatalog() {
    return {
        openai: {
            keys: ['OPENAI_API_KEY', 'OPEN_AI_API_KEY'],
            modelEnv: 'OPENAI_MODEL',
            defaultModel: 'gpt-4o-mini',
        },
        gemini: {
            keys: ['GEMINI_API_KEY'],
            modelEnv: 'GEMINI_MODEL',
            defaultModel: 'gemini-2.0-flash',
        },
        claude: {
            keys: ['CLAUDE_API_KEY'],
            modelEnv: 'CLAUDE_MODEL',
            defaultModel: 'claude-sonnet-4-20250514',
        },
        openrouter: {
            keys: [...OPENROUTER_KEY_ENV_NAMES],
            modelEnv: 'OPENROUTER_MODEL',
            defaultModel: 'openrouter/auto',
        },
        grok: {
            keys: ['XAI_API_KEY', 'GROK_API_KEY'],
            modelEnv: 'XAI_MODEL',
            defaultModel: 'grok-2-latest',
        },
        mistral: {
            keys: ['MISTRAL_API_KEY'],
            modelEnv: 'MISTRAL_MODEL',
            defaultModel: 'mistral-small-latest',
        },
        kimi: {
            keys: ['KIMI_API_KEY'],
            modelEnv: 'KIMI_MODEL',
            defaultModel: 'moonshot-v1-8k',
        },
        deepseek: {
            keys: ['DEEPSEEK_API_KEY'],
            modelEnv: 'DEEPSEEK_MODEL',
            defaultModel: 'deepseek-chat',
        },
        perplexity: {
            keys: ['PERPLEXITY_API_KEY'],
            modelEnv: 'PERPLEXITY_MODEL',
            defaultModel: 'sonar',
        },
        qwen: {
            keys: ['QWEN_API_KEY', 'DASHSCOPE_API_KEY'],
            modelEnv: 'QWEN_MODEL',
            defaultModel: 'qwen-plus',
        },
        cohere: {
            keys: ['COHERE_API_KEY'],
            modelEnv: 'COHERE_MODEL',
            defaultModel: 'command-r-plus',
        },
        cloudflare: {
            keys: ['CLOUDFLARE_API_KEY', 'CLAUDEFLARE_API_KEY'],
            also: ['CLOUDFLARE_ACCOUNT_ID'],
        },
        tavily: {
            keys: ['TAVILY_API_KEY'],
        },
        firebase: {
            keys: ['FIREBASE_PROJECT_ID'],
            also: ['FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY'],
        },
        githubOAuth: {
            keys: ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET'],
        },
        stripe: {
            keys: ['STRIPE_SECRET_KEY'],
        },
        pollinations: {
            keys: ['POLLINATIONS_API_KEY', 'POLINATIONS_API_KEY'],
        },
    };
}

function isProviderConfigured(entry) {
    if (!entry?.keys?.some((key) => configured(key))) return false;
    if (entry.also?.length && !entry.also.every((key) => configured(key))) return false;
    return true;
}

function buildProviderSnapshot() {
    const catalog = providerCatalog();
    const snapshot = {};
    Object.entries(catalog).forEach(([id, entry]) => {
        snapshot[id] = {
            configured: isProviderConfigured(entry),
            model: process.env[entry.modelEnv]?.trim() || entry.defaultModel || null,
            status: isProviderConfigured(entry) ? 'configured' : 'missing_configuration',
        };
    });
    snapshot.openrouter.configured = snapshot.openrouter.configured || snapshot.openai.configured;
    return snapshot;
}

async function probeOpenAI() {
    const key = (process.env.OPENAI_API_KEY || process.env.OPEN_AI_API_KEY || '').trim();
    if (!key) return { status: 'missing_configuration' };
    try {
        const response = await fetch('https://api.openai.com/v1/models', {
            headers: { Authorization: `Bearer ${key}` },
            signal: AbortSignal.timeout(8000),
        });
        if (response.status === 401) return { status: 'authentication_failed' };
        if (!response.ok) return { status: 'configuration_error', httpStatus: response.status };
        return { status: 'ok' };
    } catch (error) {
        return { status: 'network_error', message: error.message };
    }
}

async function probeGemini() {
    const key = process.env.GEMINI_API_KEY?.trim();
    if (!key) return { status: 'missing_configuration' };
    const model = process.env.GEMINI_MODEL?.trim() || 'gemini-2.0-flash';
    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}?key=${encodeURIComponent(key)}`;
        const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (response.status === 400 || response.status === 403) return { status: 'authentication_failed' };
        if (response.status === 404) return { status: 'wrong_model' };
        if (!response.ok) return { status: 'configuration_error', httpStatus: response.status };
        return { status: 'ok' };
    } catch (error) {
        return { status: 'network_error', message: error.message };
    }
}

async function probeOpenRouter() {
    const key = getOpenRouterApiKey();
    if (!key) return { status: 'missing_configuration' };
    try {
        const response = await fetch('https://openrouter.ai/api/v1/models', {
            headers: { Authorization: `Bearer ${key}` },
            signal: AbortSignal.timeout(8000),
        });
        if (response.status === 401) return { status: 'authentication_failed' };
        if (!response.ok) return { status: 'configuration_error', httpStatus: response.status };
        return { status: 'ok' };
    } catch (error) {
        return { status: 'network_error', message: error.message };
    }
}

async function probeWithCache(id, probeFn) {
    const cacheKey = `probe:${id}`;
    if (!probeWithCache.cache) probeWithCache.cache = new Map();
    const cached = probeWithCache.cache.get(cacheKey);
    if (cached && cached.expires > Date.now()) return cached.value;
    const value = await probeFn();
    probeWithCache.cache.set(cacheKey, { value, expires: Date.now() + 120000 });
    return value;
}

async function buildProviderHealth({ probe = false } = {}) {
    const snapshot = buildProviderSnapshot();
    if (!probe) return snapshot;

    const probes = {
        openai: probeOpenAI,
        gemini: probeGemini,
        openrouter: probeOpenRouter,
    };
    await Promise.all(Object.entries(probes).map(async ([id, fn]) => {
        if (!snapshot[id]?.configured) return;
        const result = await probeWithCache(id, fn);
        snapshot[id] = { ...snapshot[id], ...result };
    }));
    return snapshot;
}

function logStartupConfig() {
    const catalog = providerCatalog();
    Object.entries(catalog).forEach(([id, entry]) => {
        const state = isProviderConfigured(entry) ? 'configured' : 'missing';
        console.log(`[CONFIG] ${id}: ${state}`);
    });
    try {
        const { logAiProviderStatus } = require('./chatProviderRuntime');
        logAiProviderStatus();
    } catch (error) {
        console.warn('[CONFIG] AI provider status log skipped:', error.message);
    }
    try {
        const { imageGenerationHealth } = require('./imageConfig');
        const image = imageGenerationHealth();
        const cf = image.cloudflare || {};
        console.log(`[CONFIG] image generation: ${image.configured ? 'ready' : 'not ready'} (provider=${image.provider || 'none'})`);
        if (image.explicitProvider === 'cloudflare' || image.provider === 'cloudflare') {
            console.log(`[CONFIG] cloudflare workers ai image: account=${cf.accountIdPresent ? 'set' : 'MISSING'}, token=${cf.tokenPresent ? 'set' : 'MISSING'}, model=${cf.model || 'default'}`);
            if (!cf.ready && image.missingEnvVars?.length) {
                console.log(`[CONFIG] image missing: ${image.missingEnvVars.join('; ')}`);
            }
        }
    } catch (error) {
        console.warn('[CONFIG] Image generation status log skipped:', error.message);
    }
    try {
        const { getMagicHourVideoStatus } = require('./services/magicHourVideoService');
        const { getGeminiVideoStatus } = require('./services/geminiVideoService');
        const { resolveVideoProviderPreference } = require('./services/magicHourConfig');
        const mh = getMagicHourVideoStatus();
        const gemini = getGeminiVideoStatus();
        const activeProvider = resolveVideoProviderPreference();
        const configured = activeProvider === 'magichour' ? mh.configured : gemini.configured;
        console.log(
            `[CONFIG] video generation: ${configured ? 'ready' : 'not ready'} `
            + `(provider=${activeProvider || 'none'}, `
            + `magicHourKey=${mh.apiKeyPresent ? 'set' : 'MISSING'}, `
            + `magicHourKeySource=${mh.apiKeySource || 'none'}, model=${mh.model || 'default'})`,
        );
        if (mh.apiKeyPresent) {
            const { probeMagicHourAuth } = require('./services/magicHourClient');
            void probeMagicHourAuth().then((probe) => {
                if (probe.keyConfigured && probe.ok) {
                    console.log('[CONFIG] Magic Hour API auth: ok');
                } else if (probe.keyConfigured && probe.httpStatus === 401) {
                    console.warn(
                        '[CONFIG] Magic Hour API key is present but rejected (HTTP 401). '
                        + 'Regenerate the key at https://magichour.ai/developer and set MAGIC_HOUR_API_KEY in backend/.env',
                    );
                } else if (probe.keyConfigured && !probe.ok && !probe.transient) {
                    console.warn(`[CONFIG] Magic Hour API auth check failed (HTTP ${probe.httpStatus || 'unknown'})`);
                }
            }).catch(() => {});
        }
    } catch (error) {
        console.warn('[CONFIG] Video generation status log skipped:', error.message);
    }
}

function getCachedProbeStatus(providerId) {
    if (!probeWithCache.cache) return null;
    return probeWithCache.cache.get(`probe:${providerId}`)?.value?.status || null;
}

/** When a probe ran and failed auth/config, treat the direct provider as unavailable. */
function directProviderUsable(providerId, snapshot) {
    if (!snapshot[providerId]?.configured) return false;
    const probeStatus = getCachedProbeStatus(providerId);
    if (!probeStatus || probeStatus === 'ok') return true;
    if (['authentication_failed', 'wrong_model', 'configuration_error'].includes(probeStatus)) return false;
    return true;
}

function openRouterUsable(snapshot) {
    if (!snapshot.openrouter?.configured) return false;
    const probeStatus = getCachedProbeStatus('openrouter');
    if (probeStatus && probeStatus !== 'ok') return false;
    return true;
}

function providerAvailabilityForRouter() {
    const snapshot = buildProviderSnapshot();
    const viaOpenRouter = openRouterUsable(snapshot);
    const perplexity = directProviderUsable('perplexity', snapshot) || viaOpenRouter;
    return {
        gpt: directProviderUsable('openai', snapshot) || viaOpenRouter,
        gemini: directProviderUsable('gemini', snapshot) || viaOpenRouter,
        claude: directProviderUsable('claude', snapshot) || viaOpenRouter,
        grok: directProviderUsable('grok', snapshot) || viaOpenRouter,
        mistral: directProviderUsable('mistral', snapshot) || viaOpenRouter,
        kimi: directProviderUsable('kimi', snapshot) || viaOpenRouter,
        perplexity,
        others: viaOpenRouter,
    };
}

const SMART_ROUTE_FALLBACK_ORDER = ['gemini', 'gpt', 'deepseek', 'claude', 'mistral', 'llama', 'perplexity', 'grok', 'cloudflare'];

function isRoutedModelAvailable(modelSlug, availability) {
    if (modelSlug === 'cloudflare') {
        return Boolean(
            ((process.env.CLOUDFLARE_API_KEY || process.env.CLAUDEFLARE_API_KEY) && process.env.CLOUDFLARE_ACCOUNT_ID)
            || availability.others,
        );
    }
    const key = {
        gpt: 'gpt',
        copilot: 'gpt',
        gemini: 'gemini',
        claude: 'claude',
        grok: 'grok',
        mistral: 'mistral',
        kimi: 'kimi',
        deepseek: 'others',
        llama: 'others',
        perplexity: 'perplexity',
        qwen: 'others',
        cohere: 'others',
    }[modelSlug];
    if (!key) return availability.others;
    return Boolean(availability[key]);
}

function resolveAvailableSmartModel(preferredModel, modelAllowed) {
    const availability = providerAvailabilityForRouter();
    const tryModel = (slug) => modelAllowed(slug) && isRoutedModelAvailable(slug, availability);
    if (tryModel(preferredModel)) return preferredModel;
    for (const candidate of SMART_ROUTE_FALLBACK_ORDER) {
        if (tryModel(candidate)) return candidate;
    }
    return null;
}

async function warmProviderProbes() {
    try {
        await buildProviderHealth({ probe: true });
    } catch (error) {
        console.warn('[CONFIG] Provider probe warmup failed:', error.message);
    }
}

module.exports = {
    SMART_ROUTE_FALLBACK_ORDER,
    buildProviderHealth,
    buildProviderSnapshot,
    isRoutedModelAvailable,
    logStartupConfig,
    providerAvailabilityForRouter,
    resolveAvailableSmartModel,
    warmProviderProbes,
    maskConfigured,
};
