const stripQuotes = (value) => String(value || '').trim().replace(/^["']|["']$/g, '');

const getPollinationsApiKey = () =>
    stripQuotes(process.env.POLLINATIONS_API_KEY || process.env.POLINATIONS_API_KEY);

const isPollinationsKey = (value) => /^sk_[A-Za-z0-9]+/i.test(stripQuotes(value));

const resolveImageProvider = () => {
    const explicit = String(process.env.IMAGE_PROVIDER || '').trim().toLowerCase();
    const pollinationsKey = getPollinationsApiKey();
    const openAiKeys = [
        process.env.IMAGE_API_KEY,
        process.env.OPENAI_API_KEY,
        process.env.OPEN_AI_API_KEY,
        process.env.API_IMAGE_KEY,
    ]
        .map(stripQuotes)
        .filter(Boolean);
    const apiKey = process.env.IMAGE_API_URL
        ? openAiKeys[0]
        : openAiKeys.find((value) => /^sk-/i.test(value) && !/^sk-or-/i.test(value));
    const account = stripQuotes(process.env.CLOUDFLARE_ACCOUNT_ID);
    const cloudflareKey = stripQuotes(
        process.env.CLOUDFLARE_API_KEY || process.env.CLAUDEFLARE_API_KEY || process.env.API_IMAGE_KEY
    );
    const cloudflareConfigured = Boolean(account && cloudflareKey);

    if (explicit === 'pollinations') {
        return { provider: 'pollinations', pollinationsKey, apiKey, cloudflareConfigured, account, cloudflareKey };
    }
    if (explicit === 'cloudflare') {
        return { provider: 'cloudflare', pollinationsKey, apiKey, cloudflareConfigured, account, cloudflareKey };
    }
    if (explicit === 'openai') {
        return { provider: 'openai', pollinationsKey, apiKey, cloudflareConfigured, account, cloudflareKey };
    }

    if (pollinationsKey && isPollinationsKey(pollinationsKey)) {
        return { provider: 'pollinations', pollinationsKey, apiKey, cloudflareConfigured, account, cloudflareKey };
    }
    if (cloudflareConfigured && !apiKey) {
        return { provider: 'cloudflare', pollinationsKey, apiKey, cloudflareConfigured, account, cloudflareKey };
    }
    if (apiKey) {
        return { provider: 'openai', pollinationsKey, apiKey, cloudflareConfigured, account, cloudflareKey };
    }
    if (cloudflareConfigured) {
        return { provider: 'cloudflare', pollinationsKey, apiKey, cloudflareConfigured, account, cloudflareKey };
    }

    return { provider: 'none', pollinationsKey, apiKey, cloudflareConfigured, account, cloudflareKey };
};

const extractPollinationsErrorMessage = (data, response, rawText = '') => {
    if (data?.error) {
        if (typeof data.error === 'string') return data.error;
        if (data.error.message) return String(data.error.message);
        if (data.error.code) return String(data.error.code);
    }
    if (data?.message) return String(data.message);
    if (data?.detail) {
        return typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail);
    }
    if (rawText) return rawText.slice(0, 500);
    return `Pollinations HTTP ${response.status}`;
};

const logPollinationsResponse = (response, data, rawText, durationMs, model) => {
    const errorMessage = !response.ok || data?.success === false
        ? extractPollinationsErrorMessage(data, response, rawText)
        : null;
    console.log('[IMAGE] Pollinations response status:', response.status);
    console.log('[IMAGE] Pollinations content-type:', response.headers.get('content-type') || '(none)');
    if (errorMessage) {
        console.log('[IMAGE] Pollinations error:', errorMessage);
        if (data?.error?.code) console.log('[IMAGE] Pollinations error code:', data.error.code);
    }
    console.log('[IMAGE] Pollinations request durationMs:', durationMs);
    console.log('[IMAGE] Pollinations model:', model);
};

const generatePollinationsImage = async (prompt, options = {}) => {
    const pollinationsKey = getPollinationsApiKey();
    if (!pollinationsKey) {
        throw new Error('Pollinations API key is not configured.');
    }

    const model = stripQuotes(options.model || process.env.POLLINATIONS_IMAGE_MODEL || 'flux');
    const size = stripQuotes(options.size || process.env.IMAGE_SIZE || '1024x1024');
    const baseUrl = stripQuotes(process.env.POLLINATIONS_API_URL || 'https://gen.pollinations.ai');
    const url = `${baseUrl.replace(/\/$/, '')}/v1/images/generations`;

    console.log('[IMAGE] Sending request to Pollinations');
    console.log('[IMAGE] Pollinations endpoint:', url);

    const started = Date.now();
    const response = await fetch(url, {
        method: 'POST',
        signal: AbortSignal.timeout(180000),
        headers: {
            Authorization: `Bearer ${pollinationsKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            prompt: prompt.slice(0, 4000),
            model,
            size,
            n: 1,
            response_format: 'b64_json',
        }),
    });

    const contentType = response.headers.get('content-type') || '';
    let data = null;
    let rawText = '';
    if (contentType.includes('application/json')) {
        data = await response.json().catch(() => null);
    } else {
        rawText = await response.text().catch(() => '');
        if (rawText && contentType.includes('json')) {
            try {
                data = JSON.parse(rawText);
            } catch {
                data = null;
            }
        }
    }

    const durationMs = Date.now() - started;
    logPollinationsResponse(response, data, rawText, durationMs, model);

    return { response, data, model, rawText, durationMs, url };
};

module.exports = {
    getPollinationsApiKey,
    resolveImageProvider,
    generatePollinationsImage,
    isPollinationsKey,
    extractPollinationsErrorMessage,
};
