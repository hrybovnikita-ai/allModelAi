const { getGeminiApiKey, normalizeModelId } = require('./geminiApiService');

/** Defaults verified via ListModels + generateContent smoke (see scripts/gemini-models-audit.mjs). */
const DEFAULT_GEMINI_TEXT_MODEL = 'gemini-3.5-flash-lite';
const DEFAULT_GEMINI_VISION_MODEL = 'gemini-3-flash-preview';

/** Stale UI variant direct ids → API-verified ids (no OpenRouter fallback). */
const LEGACY_GEMINI_DIRECT_ALIASES = {
    'gemini-2.5-flash': DEFAULT_GEMINI_TEXT_MODEL,
    'gemini-3.5-flash': 'gemini-3-flash-preview',
    'gemini-3.6-flash': 'gemini-3-flash-preview',
};

function shouldUseGoogleGeminiDirect(routedModel) {
    return String(routedModel || '').trim() === 'gemini' && Boolean(getGeminiApiKey());
}

function resolveGeminiDirectModel({ selectedVariant, hasImages } = {}) {
    if (selectedVariant?.direct) {
        const raw = normalizeModelId(selectedVariant.direct);
        return normalizeModelId(LEGACY_GEMINI_DIRECT_ALIASES[raw] || raw);
    }
    const visionOverride = String(process.env.GEMINI_VISION_MODEL || '').trim();
    if (hasImages) {
        return normalizeModelId(visionOverride || DEFAULT_GEMINI_VISION_MODEL);
    }
    return normalizeModelId(process.env.GEMINI_MODEL || DEFAULT_GEMINI_TEXT_MODEL);
}

module.exports = {
    DEFAULT_GEMINI_TEXT_MODEL,
    DEFAULT_GEMINI_VISION_MODEL,
    LEGACY_GEMINI_DIRECT_ALIASES,
    resolveGeminiDirectModel,
    shouldUseGoogleGeminiDirect,
};
