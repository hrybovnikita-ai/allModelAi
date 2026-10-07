const { classifyTask } = require('./classifyTask');
const {
    getCapabilities,
    displayModelName,
    defaultFallbackChain,
    TASK_TO_CAPABILITY,
} = require('./capabilities');
const { findRoutedModelWithApiKey } = require('../../chatProviderRuntime');

const MODE_OVERRIDES = {
    economy: {
        slug: process.env.CLOUDFLARE_ACCOUNT_ID ? 'cloudflare' : 'gemini',
        reason: 'Economy mode prioritizes lower cost and fast inference.',
    },
    speed: { slug: 'gemini', reason: 'Speed mode prioritizes low-latency responses.' },
    quality: { slug: 'claude', reason: 'Quality mode prioritizes strong reasoning and writing.' },
};

const TASK_PICKS = {
    greeting: { slug: 'gemini', reason: 'Simple chat — fast general model.' },
    vision: { slug: 'gemini', reason: 'Multimodal vision and UI guidance.' },
    coding: { slug: 'gemini', reason: 'Strong coding and implementation support.' },
    research: { slug: 'perplexity', reason: 'Web-backed research with sources.' },
    writing: { slug: 'claude', reason: 'Long-form writing and editing.' },
    document_analysis: { slug: 'claude', reason: 'Long-context document analysis.' },
    summarization: { slug: 'gpt', reason: 'Concise summarization.' },
    translation: { slug: 'gemini', reason: 'Multilingual translation.' },
    reasoning: { slug: 'claude', reason: 'Complex reasoning tasks.' },
    general: { slug: 'gemini', reason: 'Balanced general-purpose answers.' },
};

function scoreSlugForTask(slug, taskType, preferSpeed) {
    const cap = getCapabilities(slug);
    if (!cap) return -1;
    const key = TASK_TO_CAPABILITY[taskType] || 'reasoning';
    let score = cap[key] ? 3 : 0;
    if (preferSpeed && cap.fast) score += 2;
    if (taskType === 'coding' && cap.coding) score += 2;
    if (taskType === 'research' && cap.research) score += 4;
    if (taskType === 'vision' && cap.vision) score += 5;
    if (taskType === 'document_analysis' && cap.longContext) score += 3;
    return score;
}

function pickBestSlug(taskType, preferSpeed, modelAllowed) {
    const preferred = TASK_PICKS[taskType]?.slug || 'gemini';
    if (modelAllowed(preferred) && findRoutedModelWithApiKey(preferred, modelAllowed)) {
        return preferred;
    }
    const candidates = Object.keys(require('./capabilities').MODEL_CAPABILITIES);

    let best = preferred;
    let bestScore = -1;
    for (const slug of candidates) {
        if (!modelAllowed(slug)) continue;
        const score = scoreSlugForTask(slug, taskType, preferSpeed);
        if (score > bestScore && findRoutedModelWithApiKey(slug, modelAllowed)) {
            bestScore = score;
            best = slug;
        }
    }
    return best;
}

/**
 * Smart Router 2.0 — extends legacy chooseSmartRoute shape with structured metadata.
 * @param {string} prompt
 * @param {object} options
 * @returns {object}
 */
function selectSmartRoute(prompt, options = {}) {
    const {
        routerMode = 'balanced',
        hasImage = false,
        modelAllowed = () => true,
    } = options;

    const taskMeta = classifyTask(prompt, {
        hasImage,
        routerMode,
        useKnowledge: options.useKnowledge,
    });

    let slug;
    let reason;

    if (hasImage) {
        slug = routerMode === 'quality' ? 'gpt' : 'gemini';
        reason = routerMode === 'quality'
            ? 'High-precision vision for detailed image analysis.'
            : 'Fast multimodal vision for screenshots and UI help.';
        taskMeta.taskType = 'vision';
    } else if (MODE_OVERRIDES[routerMode] && routerMode !== 'balanced') {
        slug = MODE_OVERRIDES[routerMode].slug;
        reason = MODE_OVERRIDES[routerMode].reason;
    } else {
        slug = pickBestSlug(taskMeta.taskType, taskMeta.preferSpeed, modelAllowed);
        reason = TASK_PICKS[taskMeta.taskType]?.reason || TASK_PICKS.general.reason;
    }

    const available = findRoutedModelWithApiKey(slug, modelAllowed);
    const fallbacks = defaultFallbackChain(slug)
        .filter((candidate) => modelAllowed(candidate) && findRoutedModelWithApiKey(candidate, modelAllowed))
        .slice(0, 4);

    if (available && available !== slug) {
        reason = `${reason} (using ${displayModelName(available)} — preferred provider unavailable.)`;
        slug = available;
    } else if (!available && fallbacks.length) {
        slug = fallbacks[0];
        reason = `${reason} (switched to ${displayModelName(slug)}.)`;
    }

    const cap = getCapabilities(slug);

    return {
        model: slug,
        category: taskMeta.taskType,
        taskType: taskMeta.taskType,
        reason,
        selectedProvider: cap?.provider || slug,
        selectedModel: cap?.model || slug,
        displayName: displayModelName(slug),
        fallbacks: fallbacks.map(displayModelName),
        fallbackSlugs: fallbacks,
        needsKnowledge: taskMeta.needsKnowledge,
        needsMultiAgent: taskMeta.needsMultiAgent,
    };
}

/** Backward-compatible wrapper (no modelAllowed — caller adjusts plan access). */
function chooseSmartRouteLegacy(prompt, routerMode = 'balanced', hasImage = false) {
    const decision = selectSmartRoute(prompt, { routerMode, hasImage, modelAllowed: () => true });
    return {
        model: decision.model,
        reason: decision.reason,
        category: decision.category,
        taskType: decision.taskType,
        selectedProvider: decision.selectedProvider,
        selectedModel: decision.selectedModel,
        displayName: decision.displayName,
        fallbacks: decision.fallbackSlugs,
        router: {
            taskType: decision.taskType,
            reason: decision.reason,
            fallbackUsed: false,
            fallbacks: decision.fallbacks,
        },
    };
}

module.exports = {
    selectSmartRoute,
    chooseSmartRouteLegacy,
};
