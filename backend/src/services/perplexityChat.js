const envTrim = (name) => String(process.env[name] || '').trim();

function getPerplexityApiKey() {
    return envTrim('PERPLEXITY_API_KEY');
}

function isPerplexityConfigured() {
    return Boolean(getPerplexityApiKey());
}

function resolvePerplexityDirectModel(selectedVariant) {
    if (selectedVariant?.direct) return selectedVariant.direct;
    const gateway = String(selectedVariant?.gateway || '').trim();
    if (gateway.startsWith('perplexity/')) return gateway.slice('perplexity/'.length);
    return envTrim('PERPLEXITY_MODEL') || 'sonar';
}

module.exports = {
    getPerplexityApiKey,
    isPerplexityConfigured,
    resolvePerplexityDirectModel,
    PERPLEXITY_CHAT_URL: 'https://api.perplexity.ai/chat/completions',
};
