const crypto = require('node:crypto');
const { MODEL_CAPABILITIES, getCapabilities, displayModelName } = require('./smartRouter2/capabilities');
const {
    findRoutedModelWithApiKey,
    slugDependsOnOpenRouterPaidCredits,
} = require('../chatProviderRuntime');
const { passiveStatusForProvider } = require('./providerRequestTelemetry');
const { slugToProviderId } = require('./providerErrorClassification');
const { isSlugBlockedByGatewayHealth } = require('./gatewayModelHealth');
const {
    getConversationAssignmentAsync,
    setConversationAssignmentAsync,
} = require('./anoninPersistence');

const BAD_HEALTH = new Set([
    'unavailable',
    'authentication_failed',
    'rate_limited',
    'quota_exhausted',
]);

const ANONIN_SLUG = 'anonin';
const DISPLAY_NAME = 'Anonin Model';

/** Common typos / aliases → canonical virtual slug. */
const ANONIN_ALIASES = new Set([
    'anonin',
    'anonim',
    'anonymous',
    'anonin-model',
    'anonin_model',
    'anonin model',
]);

function normalizeVirtualChatModelSlug(raw) {
    const compact = String(raw || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (ANONIN_ALIASES.has(compact)) return ANONIN_SLUG;
    if (compact === 'anonin model' || compact.startsWith('anonin model')) return ANONIN_SLUG;
    return String(raw || '').trim().toLowerCase();
}

function isAnoninVirtualSlug(raw) {
    return normalizeVirtualChatModelSlug(raw) === ANONIN_SLUG;
}

const EXCLUDED_SLUGS = new Set(['smart', 'anonin', 'ai_python']);

const PROVIDER_DISPLAY = {
    openai: 'OpenAI',
    anthropic: 'Anthropic',
    google: 'Google',
    xai: 'xAI',
    deepseek: 'DeepSeek',
    mistral: 'Mistral AI',
    moonshot: 'Moonshot AI',
    meta: 'Meta',
    perplexity: 'Perplexity',
    openrouter: 'OpenRouter',
    cloudflare: 'Cloudflare',
    cohere: 'Cohere',
    qwen: 'Alibaba Cloud',
    nvidia: 'NVIDIA',
};

const SLUG_PROVIDER_DISPLAY = {
    qwen: 'Alibaba Cloud',
    llama: 'Meta',
    cohere: 'Cohere',
    gpt: 'OpenAI',
    copilot: 'OpenAI',
    claude: 'Anthropic',
    gemini: 'Google',
    grok: 'xAI',
    deepseek: 'DeepSeek',
    mistral: 'Mistral AI',
    kimi: 'Moonshot AI',
    perplexity: 'Perplexity',
    cloudflare: 'Cloudflare',
    'gpt-oss': 'Cloudflare',
    'gpt-oss-groq': 'GroqCloud',
    nemotron: 'NVIDIA',
    'deepseek-r1': 'DeepSeek',
    ollama: 'Ollama Cloud',
};

function providerLabelForSlug(slug) {
    if (SLUG_PROVIDER_DISPLAY[slug]) return SLUG_PROVIDER_DISPLAY[slug];
    const cap = getCapabilities(slug);
    if (!cap) return 'Unknown provider';
    const pid = slugToProviderId(cap.provider) || cap.provider;
    return PROVIDER_DISPLAY[pid] || PROVIDER_DISPLAY[cap.provider] || String(cap.provider);
}

function buildIdentityLabels(slug, gatewayModelId) {
    // Prefer human-readable catalog names (e.g. "GPT-OSS 120B — Groq") for Reveal UI.
    const display = displayModelName(slug);
    return {
        providerLabel: providerLabelForSlug(slug),
        modelLabel: display || gatewayModelId || slug,
        actualSlug: slug,
        gatewayModelId: gatewayModelId || null,
    };
}

function isHealthExcluded(slug) {
    if (isSlugBlockedByGatewayHealth(slug)) return true;
    const cap = getCapabilities(slug);
    if (!cap) return true;
    const providerId = slugToProviderId(cap.provider) || cap.provider;
    const passive = passiveStatusForProvider(providerId, true);
    if (BAD_HEALTH.has(passive?.operationalStatus)) return true;

    // Gateway-only / OpenRouter-billed slugs must also respect OpenRouter health.
    // Without this, qwen stays eligible after OpenRouter returns insufficient credits
    // because telemetry is recorded against provider id "openrouter", not "qwen".
    if (slugDependsOnOpenRouterPaidCredits(slug)) {
        const openRouter = passiveStatusForProvider('openrouter', true);
        if (BAD_HEALTH.has(openRouter?.operationalStatus)) return true;
    }
    return false;
}

function listEligibleAnoninSlugs(modelAllowed, { hasVision = false, skipHealth = false } = {}) {
    return Object.keys(MODEL_CAPABILITIES).filter((slug) => {
        if (EXCLUDED_SLUGS.has(slug)) return false;
        const cap = getCapabilities(slug);
        if (hasVision && !cap?.vision) return false;
        if (!modelAllowed(slug)) return false;
        if (!findRoutedModelWithApiKey(slug, modelAllowed)) return false;
        if (!skipHealth && isHealthExcluded(slug)) return false;
        return true;
    });
}

/** Last-resort backend when health filters leave no eligible Anonin targets. */
const ANONIN_EMERGENCY_SLUG_ORDER = [
    'gemini',
    'cloudflare',
    'gpt-oss',
    'gpt-oss-groq',
    'nemotron',
    'deepseek-r1',
    'groq',
    'gpt',
    'claude',
    'mistral',
    'kimi',
    'grok',
    'deepseek',
    'perplexity',
    'llama',
    'qwen',
    'cohere',
];

function pickEmergencyAnoninSlug(modelAllowed, { hasVision = false } = {}) {
    for (const slug of ANONIN_EMERGENCY_SLUG_ORDER) {
        if (EXCLUDED_SLUGS.has(slug)) continue;
        const cap = getCapabilities(slug);
        if (hasVision && !cap?.vision) continue;
        if (!modelAllowed(slug)) continue;
        const routed = findRoutedModelWithApiKey(slug, modelAllowed);
        if (routed) return routed;
    }
    const relaxed = listEligibleAnoninSlugs(modelAllowed, { hasVision, skipHealth: true });
    return relaxed[0] || null;
}

function pickRandomSlug(eligible, { avoidSlug = null } = {}) {
    if (!eligible.length) return null;
    let pool = eligible;
    if (avoidSlug && eligible.length > 1) {
        pool = eligible.filter((s) => s !== avoidSlug);
        if (!pool.length) pool = eligible;
    }
    const index = crypto.randomInt(0, pool.length);
    return pool[index];
}

function normalizeStrategy(raw) {
    const key = String(raw || 'random').trim().toLowerCase();
    if (key === 'smart' || key === 'per_message' || key === 'per-message') return key === 'per-message' ? 'per_message' : key;
    return 'random';
}

async function resolveAnoninRouting({
    connection,
    email,
    conversationId,
    strategy: rawStrategy,
    modelAllowed,
    hasVision,
    chooseSmartRoute,
    latestPrompt,
    routerMode,
    normalizedInputMessages,
    responsePrefs,
    routerPerformance,
}) {
    const strategy = normalizeStrategy(rawStrategy);
    const perMessage = strategy === 'per_message';
    let preferred = null;

    if (!perMessage && conversationId) {
        const assignment = await getConversationAssignmentAsync(connection, email, conversationId);
        if (assignment?.assigned_slug) {
            preferred = assignment.assigned_slug;
            if (modelAllowed(preferred) && findRoutedModelWithApiKey(preferred, modelAllowed) && !isHealthExcluded(preferred)) {
                if (!hasVision || getCapabilities(preferred)?.vision) {
                    return {
                        ok: true,
                        slug: preferred,
                        strategy: assignment.strategy || strategy,
                        reusedAssignment: true,
                        fallbackFrom: null,
                    };
                }
            }
        }
    }

    let eligible = listEligibleAnoninSlugs(modelAllowed, { hasVision });
    if (!eligible.length) {
        const emergency = pickEmergencyAnoninSlug(modelAllowed, { hasVision });
        if (emergency) {
            eligible = [emergency];
        } else {
            return {
                ok: false,
                code: 'ANONIN_UNAVAILABLE',
                message: 'Anonin Model is temporarily unavailable. Please try again later or select another AI model.',
            };
        }
    }

    let slug = null;
    if (strategy === 'smart') {
        const routeDecision = chooseSmartRoute(
            latestPrompt,
            routerMode,
            hasVision,
            modelAllowed,
            {
                responseLanguagePreference: responsePrefs?.responseLanguage,
                profileLanguage: responsePrefs?.profileLanguage,
                priorMessages: normalizedInputMessages.slice(0, -1),
                routerPerformance,
            },
        );
        const candidate = routeDecision?.model;
        if (candidate && eligible.includes(candidate)) {
            slug = candidate;
        } else {
            const configured = findRoutedModelWithApiKey(candidate, modelAllowed);
            slug = configured && eligible.includes(configured) ? configured : pickRandomSlug(eligible);
        }
    } else {
        slug = pickRandomSlug(eligible, { avoidSlug: preferred });
    }

    if (!slug) {
        return {
            ok: false,
            code: 'ANONIN_UNAVAILABLE',
            message: 'Anonin Model is temporarily unavailable. Please try again later or select another AI model.',
        };
    }

    const available = hasVision
        ? (getCapabilities(slug)?.vision ? findRoutedModelWithApiKey(slug, modelAllowed) : null)
        : findRoutedModelWithApiKey(slug, modelAllowed);
    let fallbackFrom = null;
    if (!available || available !== slug) {
        fallbackFrom = slug;
        slug = findRoutedModelWithApiKey(slug, modelAllowed);
        if (!slug || !eligible.includes(slug)) {
            slug = pickRandomSlug(eligible);
        }
    } else {
        slug = available;
    }

    if (!slug) {
        return {
            ok: false,
            code: 'ANONIN_UNAVAILABLE',
            message: 'Anonin Model is temporarily unavailable. Please try again later or select another AI model.',
        };
    }

    if (!perMessage && conversationId) {
        await setConversationAssignmentAsync(connection, email, conversationId, slug, strategy);
    }

    return {
        ok: true,
        slug,
        strategy,
        reusedAssignment: false,
        fallbackFrom,
    };
}

function maskStreamMetaForAnonin(baseMeta, { assistantMessageId } = {}) {
    return {
        unlimited: baseMeta.unlimited,
        plan: baseMeta.plan,
        requestedModel: ANONIN_SLUG,
        routedModel: ANONIN_SLUG,
        anoninMode: true,
        assistantMessageId: assistantMessageId || null,
        knowledgeSources: baseMeta.knowledgeSources,
        responseLanguage: baseMeta.responseLanguage,
        responseLanguageSource: baseMeta.responseLanguageSource,
        responseLanguageConfidence: baseMeta.responseLanguageConfidence,
        languageCorrelationId: baseMeta.languageCorrelationId,
    };
}

function anoninUserFacingError(message, code = 'ANONIN_ERROR') {
    return {
        message: message || 'Anonin Model is temporarily unavailable. Please try again later or select another AI model.',
        code,
    };
}

module.exports = {
    ANONIN_SLUG,
    DISPLAY_NAME,
    ANONIN_ALIASES,
    ANONIN_EMERGENCY_SLUG_ORDER,
    normalizeVirtualChatModelSlug,
    isAnoninVirtualSlug,
    listEligibleAnoninSlugs,
    pickEmergencyAnoninSlug,
    pickRandomSlug,
    resolveAnoninRouting,
    buildIdentityLabels,
    maskStreamMetaForAnonin,
    anoninUserFacingError,
    normalizeStrategy,
};
