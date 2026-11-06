'use strict';

/** OpenAI-compatible Inference Providers router (chat only). */
const HF_INFERENCE_CHAT_URL = 'https://router.huggingface.co/v1/chat/completions';

const DEFAULT_MODELS = [
    'meta-llama/Meta-Llama-3.1-8B-Instruct:cheapest',
    'Qwen/Qwen2.5-7B-Instruct:cheapest',
    'deepseek-ai/DeepSeek-V3-0324:cheapest',
    'mistralai/Mistral-7B-Instruct-v0.3:cheapest',
];

const FAMILY_FIRST = {
    llama: 'meta-llama/Meta-Llama-3.1-8B-Instruct:cheapest',
    groq: 'meta-llama/Meta-Llama-3.1-8B-Instruct:cheapest',
    cloudflare: 'meta-llama/Meta-Llama-3.1-8B-Instruct:cheapest',
    qwen: 'Qwen/Qwen2.5-7B-Instruct:cheapest',
    cohere: 'Qwen/Qwen2.5-7B-Instruct:cheapest',
    deepseek: 'deepseek-ai/DeepSeek-V3-0324:cheapest',
    'deepseek-r1': 'deepseek-ai/DeepSeek-R1-Distill-Qwen-7B:cheapest',
    mistral: 'mistralai/Mistral-7B-Instruct-v0.3:cheapest',
};

function parseModelList(value) {
    return String(value || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
}

/**
 * Ordered HF Inference Provider model ids (with :cheapest to limit paid surprises).
 * Puts the family matching routedModel first when known, then fills remaining defaults.
 */
function getHuggingFaceFallbackChain({ routedModel } = {}) {
    const fromEnv = parseModelList(process.env.HF_FALLBACK_MODELS);
    if (fromEnv.length) return [...new Set(fromEnv)];

    const slug = String(routedModel || '').trim().toLowerCase();
    const preferred = FAMILY_FIRST[slug];
    const chain = [];
    if (preferred) chain.push(preferred);
    for (const id of DEFAULT_MODELS) {
        if (!chain.includes(id)) chain.push(id);
    }
    return chain;
}

function isHuggingFaceInferenceConfigured() {
    return Boolean(String(process.env.HUGGINGFACE_API_KEY || process.env.HF_TOKEN || '').trim());
}

/**
 * @returns {Promise<{ ok: boolean, response?: Response, hfModel?: string }>}
 */
async function tryHuggingFaceInferenceChain({
    fetchProvider,
    requestSignal,
    hfApiKey,
    systemPrompt,
    standardInput,
    outputTokenLimit,
    routedModel,
    fallbackTracker,
    fallbackFailureCategory,
    sleepFallback,
    computeBackoffMs,
    logSmartRouter,
}) {
    const key = String(hfApiKey || '').trim();
    if (!key) return { ok: false };

    const models = getHuggingFaceFallbackChain({ routedModel });
    let hfAttemptIndex = 0;
    for (const hfModel of models) {
        if (sleepFallback && computeBackoffMs) {
            await sleepFallback(computeBackoffMs(hfAttemptIndex));
        }
        hfAttemptIndex += 1;
        const response = await fetchProvider(HF_INFERENCE_CHAT_URL, {
            method: 'POST',
            signal: requestSignal(),
            headers: {
                Authorization: `Bearer ${key}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: hfModel,
                stream: true,
                max_tokens: outputTokenLimit,
                messages: [{ role: 'system', content: systemPrompt }, ...standardInput],
            }),
        });
        if (response.ok) {
            if (fallbackTracker) {
                fallbackTracker.record({
                    from: routedModel,
                    to: 'huggingface',
                    category: fallbackFailureCategory,
                    success: true,
                });
            }
            if (typeof logSmartRouter === 'function') {
                logSmartRouter('fallback provider', {
                    from: routedModel,
                    to: 'huggingface',
                    via: 'inference_providers',
                    model: hfModel,
                });
            }
            return { ok: true, response, hfModel };
        }
    }
    return { ok: false };
}

module.exports = {
    HF_INFERENCE_CHAT_URL,
    getHuggingFaceFallbackChain,
    isHuggingFaceInferenceConfigured,
    tryHuggingFaceInferenceChain,
};
