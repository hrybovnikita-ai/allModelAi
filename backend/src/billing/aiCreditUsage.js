const { ownerPlusActive } = require('./accessControl');

function aiCreditsEnabled() {
    return String(process.env.AI_CREDITS_ENABLED || '').trim().toLowerCase() === 'true';
}

/** USD estimated provider cost → integer credits (1 credit ≈ 1/AI_CREDITS_PER_USD dollar of API cost). */
function creditsForUsage({ estimatedCostUsd = 0, inputTokens = 0, outputTokens = 0, model = '' } = {}) {
    const perUsd = Number(process.env.AI_CREDITS_PER_USD || 10_000);
    const minCharge = Number(process.env.AI_CREDITS_MIN_CHARGE || 1);
    const modelMultiplier = Number(process.env[`AI_CREDIT_MODEL_MULT_${String(model || '').toUpperCase().replace(/-/g, '_')}`] || 1);
    let fromCost = Math.ceil(Number(estimatedCostUsd || 0) * perUsd * modelMultiplier);
    if (!fromCost && (inputTokens || outputTokens)) {
        const tokenRate = Number(process.env.AI_CREDITS_PER_1K_TOKENS || 15);
        fromCost = Math.ceil(((inputTokens + outputTokens) / 1000) * tokenRate * modelMultiplier);
    }
    return Math.max(fromCost, minCharge);
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

function checkAiCreditsBeforeChat(access, balance) {
    if (!aiCreditsEnabled()) return { allowed: true };
    if (ownerPlusActive(access)) return { allowed: true };
    const bal = Number(balance ?? 0);
    if (bal > 0) return { allowed: true };
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
};
