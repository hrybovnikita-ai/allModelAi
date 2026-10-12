/** @typedef {import('node:process').Env} ProcessEnv */

const LEGACY_DEEPSEEK_VARIANT = {
    chat: 'flash',
    reasoning: 'pro',
};

function envTrim(env, name) {
    return String(env?.[name] || '').trim();
}

/**
 * Maps UI variant ids (including legacy chat/reasoning) to DeepSeek API model names.
 * @param {string | null | undefined} variantId
 * @param {ProcessEnv} [env]
 */
function resolveDeepSeekApiModel(variantId, env = process.env) {
    const normalized = String(variantId || '').toLowerCase();
    const proVariant = normalized === 'pro' || normalized === 'reasoning';
    if (proVariant) {
        return envTrim(env, 'DEEPSEEK_REASONING_MODEL') || 'deepseek-v4-pro';
    }
    return envTrim(env, 'DEEPSEEK_MODEL') || 'deepseek-flash';
}

function resolveDeepSeekVariantId(variantId) {
    const key = String(variantId || '').toLowerCase();
    return LEGACY_DEEPSEEK_VARIANT[key] || key;
}

module.exports = {
    resolveDeepSeekApiModel,
    resolveDeepSeekVariantId,
    LEGACY_DEEPSEEK_VARIANT,
};
