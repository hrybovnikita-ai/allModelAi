const { ownerPlusActive } = require('./accessControl');

function aiCreditsEnabled() {
    return String(process.env.AI_CREDITS_ENABLED || '').trim().toLowerCase() === 'true';
}

function envNum(name, fallback) {
    const raw = process.env[name];
    if (raw == null || raw === '') return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
}

/** Configurable per-model / capability credit weights (override via env). */
const DEFAULT_MODEL_WEIGHTS = {
    gemini: 1,
    gpt: 1.2,
    claude: 1.4,
    grok: 1.3,
    mistral: 0.9,
    deepseek: 0.8,
    llama: 0.7,
    qwen: 0.8,
    kimi: 1.1,
    perplexity: 1.5,
    groq: 0.7,
    cloudflare: 0.5,
    'gpt-oss': 0.5,
    nemotron: 0.4,
    'deepseek-r1': 0.5,
    copilot: 1.2,
    cohere: 1.1,
    image: 8,
    research: 4,
};

function modelWeight(model) {
    const slug = String(model || '').toLowerCase().trim();
    const envKey = `AI_CREDIT_MODEL_MULT_${slug.toUpperCase().replace(/-/g, '_')}`;
    const fromEnv = Number(process.env[envKey]);
    if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
    return DEFAULT_MODEL_WEIGHTS[slug] || envNum('AI_CREDIT_DEFAULT_MODEL_WEIGHT', 1);
}

/** USD estimated provider cost → integer credits (1 credit ≈ 1/AI_CREDITS_PER_USD dollar of API cost). */
function creditsForUsage({
    estimatedCostUsd = 0,
    inputTokens = 0,
    outputTokens = 0,
    model = '',
    capability = 'chat',
} = {}) {
    const perUsd = envNum('AI_CREDITS_PER_USD', 10_000);
    const minCharge = envNum('AI_CREDITS_MIN_CHARGE', 1);
    const weight = modelWeight(model) * (capability === 'image'
        ? envNum('AI_CREDIT_IMAGE_WEIGHT', DEFAULT_MODEL_WEIGHTS.image)
        : capability === 'research'
            ? envNum('AI_CREDIT_RESEARCH_WEIGHT', DEFAULT_MODEL_WEIGHTS.research)
            : 1);
    let fromCost = Math.ceil(Number(estimatedCostUsd || 0) * perUsd * weight);
    if (!fromCost && (inputTokens || outputTokens)) {
        const inRate = envNum('AI_CREDITS_PER_1K_INPUT_TOKENS', envNum('AI_CREDITS_PER_1K_TOKENS', 15));
        const outRate = envNum('AI_CREDITS_PER_1K_OUTPUT_TOKENS', envNum('AI_CREDITS_PER_1K_TOKENS', 15) * 1.5);
        fromCost = Math.ceil(
            ((Number(inputTokens) / 1000) * inRate + (Number(outputTokens) / 1000) * outRate) * weight,
        );
    }
    if (!fromCost && capability === 'image') {
        fromCost = Math.ceil(envNum('AI_CREDIT_IMAGE_FLAT', 25) * weight);
    }
    return Math.max(fromCost, minCharge);
}

/** Conservative pre-request hold so concurrent chats cannot overspend. */
function estimateMaxCreditHold({
    model = '',
    inputTokens = 0,
    maxOutputTokens = 2048,
    capability = 'chat',
} = {}) {
    const holdMultiplier = envNum('AI_CREDIT_RESERVE_MULTIPLIER', 1.25);
    const estimate = creditsForUsage({
        inputTokens,
        outputTokens: maxOutputTokens,
        model,
        capability,
    });
    const floor = envNum('AI_CREDIT_RESERVE_FLOOR', 5);
    return Math.max(floor, Math.ceil(estimate * holdMultiplier));
}

function listPublicCreditWeights() {
    const models = Object.keys(DEFAULT_MODEL_WEIGHTS)
        .filter((k) => !['image', 'research'].includes(k))
        .map((slug) => ({
            model: slug,
            weight: modelWeight(slug),
            exampleCreditsPer1kTokens: Math.max(
                1,
                Math.ceil(envNum('AI_CREDITS_PER_1K_TOKENS', 15) * modelWeight(slug)),
            ),
        }));
    return {
        models,
        imageFlatCredits: envNum('AI_CREDIT_IMAGE_FLAT', 25),
        researchWeight: envNum('AI_CREDIT_RESEARCH_WEIGHT', DEFAULT_MODEL_WEIGHTS.research),
        minCharge: envNum('AI_CREDITS_MIN_CHARGE', 1),
        note: 'Weights are server-configured estimates; actual charge uses measured tokens/cost after a successful response.',
    };
}

function checkUpstreamBudgetGate() {
    if (String(process.env.AI_UPSTREAM_BUDGET_PAUSED || '').trim().toLowerCase() === 'true') {
        return {
            allowed: false,
            status: 503,
            code: 'AI_UPSTREAM_BUDGET_UNAVAILABLE',
            message: 'Paid AI routes are temporarily unavailable while upstream provider budget is paused. Prepaid credits are not charged.',
        };
    }
    return { allowed: true };
}

function checkAiCreditsBeforeChat(access, balance, { minRequired = 1 } = {}) {
    if (!aiCreditsEnabled()) return { allowed: true };
    if (ownerPlusActive(access)) return { allowed: true };
    const bal = Number(balance ?? 0);
    const need = Math.max(1, Number(minRequired) || 1);
    if (bal >= need) return { allowed: true };
    if (bal > 0 && need > bal) {
        return {
            allowed: false,
            status: 402,
            code: 'AI_CREDITS_INSUFFICIENT',
            message: 'Not enough AI credits for this request. Buy credits or choose a lighter model.',
            aiCreditsBalance: bal,
            required: need,
        };
    }
    return {
        allowed: false,
        status: 402,
        code: 'AI_CREDITS_EXHAUSTED',
        message: 'Your AI credit balance is empty. Buy credits to continue chatting without losing this conversation.',
        aiCreditsBalance: bal,
    };
}

module.exports = {
    aiCreditsEnabled,
    checkAiCreditsBeforeChat,
    checkUpstreamBudgetGate,
    creditsForUsage,
    estimateMaxCreditHold,
    listPublicCreditWeights,
    modelWeight,
    DEFAULT_MODEL_WEIGHTS,
};
