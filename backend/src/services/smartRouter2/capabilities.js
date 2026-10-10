/**
 * Provider capability registry — derived from configured AllModelAI chat slugs.
 * Flags reflect supported routing dimensions only (no invented API features).
 */

const { SMART_ROUTE_FALLBACK_ORDER } = require('../../providerHealth');

/** @typedef {'gpt'|'claude'|'gemini'|'perplexity'|'deepseek'|'llama'|'mistral'|'kimi'|'grok'|'cloudflare'|'qwen'|'cohere'} ModelSlug */

const MODEL_CAPABILITIES = {
    gpt: {
        provider: 'openai',
        model: 'gpt-4o-mini',
        coding: true,
        reasoning: true,
        vision: true,
        longContext: true,
        fast: true,
        research: false,
        streaming: true,
        writing: true,
        summarization: true,
        translation: true,
    },
    claude: {
        provider: 'anthropic',
        model: 'claude-haiku-4.5',
        coding: true,
        reasoning: true,
        vision: true,
        longContext: true,
        fast: false,
        research: false,
        streaming: true,
        writing: true,
        summarization: true,
        translation: true,
    },
    gemini: {
        provider: 'google',
        model: 'gemini-2.5-flash',
        coding: true,
        reasoning: true,
        vision: true,
        longContext: true,
        fast: true,
        research: false,
        streaming: true,
        writing: true,
        summarization: true,
        translation: true,
    },
    perplexity: {
        provider: 'perplexity',
        model: 'sonar',
        coding: false,
        reasoning: true,
        vision: false,
        longContext: false,
        fast: true,
        research: true,
        streaming: true,
        writing: true,
        summarization: true,
        translation: false,
    },
    deepseek: {
        provider: 'deepseek',
        model: 'deepseek-chat',
        coding: true,
        reasoning: true,
        vision: false,
        longContext: true,
        fast: true,
        research: false,
        streaming: true,
        writing: false,
        summarization: true,
        translation: false,
    },
    llama: {
        provider: 'meta',
        model: 'llama-3.3-70b-instruct',
        coding: true,
        reasoning: true,
        vision: false,
        longContext: true,
        fast: false,
        research: false,
        streaming: true,
        writing: true,
        summarization: true,
        translation: true,
    },
    mistral: {
        provider: 'mistral',
        model: 'mistral-small-latest',
        coding: true,
        reasoning: true,
        vision: false,
        longContext: false,
        fast: true,
        research: false,
        streaming: true,
        writing: true,
        summarization: true,
        translation: true,
    },
    kimi: {
        provider: 'moonshot',
        model: 'kimi-k2.5',
        coding: true,
        reasoning: true,
        vision: false,
        longContext: true,
        fast: false,
        research: false,
        streaming: true,
        writing: true,
        summarization: true,
        translation: true,
    },
    grok: {
        provider: 'xai',
        model: 'grok-latest',
        coding: true,
        reasoning: true,
        vision: false,
        longContext: false,
        fast: true,
        research: false,
        streaming: true,
        writing: true,
        summarization: false,
        translation: false,
    },
    cloudflare: {
        provider: 'cloudflare',
        model: 'llama-3.3-70b-instruct-fp8-fast',
        coding: true,
        reasoning: false,
        vision: false,
        longContext: false,
        fast: true,
        research: false,
        streaming: true,
        writing: false,
        summarization: true,
        translation: false,
    },
    qwen: {
        provider: 'qwen',
        model: 'qwen-2.5-72b-instruct',
        coding: true,
        reasoning: true,
        vision: false,
        longContext: true,
        fast: false,
        research: false,
        streaming: true,
        writing: true,
        summarization: true,
        translation: true,
    },
    cohere: {
        provider: 'cohere',
        model: 'command-a',
        coding: false,
        reasoning: true,
        vision: false,
        longContext: true,
        fast: false,
        research: false,
        streaming: true,
        writing: true,
        summarization: true,
        translation: true,
    },
};

const TASK_TO_CAPABILITY = {
    coding: 'coding',
    reasoning: 'reasoning',
    research: 'research',
    writing: 'writing',
    summarization: 'summarization',
    document_analysis: 'longContext',
    vision: 'vision',
    translation: 'translation',
    general: 'reasoning',
    economy: 'fast',
    speed: 'fast',
};

function getCapabilities(slug) {
    return MODEL_CAPABILITIES[slug] || null;
}

function displayModelName(slug) {
    const cap = getCapabilities(slug);
    if (!cap) return slug;
    const names = {
        gpt: 'GPT-4o mini',
        claude: 'Claude Haiku',
        gemini: 'Gemini Flash',
        perplexity: 'Perplexity Sonar',
        deepseek: 'DeepSeek Chat',
        llama: 'Llama 3.3',
        mistral: 'Mistral Small',
        kimi: 'Kimi K2.5',
        grok: 'Grok',
        cloudflare: 'Cloudflare Llama',
        qwen: 'Qwen 2.5',
        cohere: 'Cohere Command',
    };
    return names[slug] || cap.model;
}

function defaultFallbackChain(excludeSlug) {
    return SMART_ROUTE_FALLBACK_ORDER.filter((s) => s !== excludeSlug);
}

module.exports = {
    MODEL_CAPABILITIES,
    TASK_TO_CAPABILITY,
    getCapabilities,
    displayModelName,
    defaultFallbackChain,
};
