const {
    resolveImageProvider,
    generatePollinationsImage,
    getPollinationsApiKey,
    extractPollinationsErrorMessage,
} = require('./pollinations');
const { buildImagePromptPayload } = require('./enhanceImagePrompt');

const safeImageUrl = (imageUrl) =>
    typeof imageUrl === 'string'
    && /^(https:\/\/|data:image\/(png|jpeg|webp);base64,)/.test(imageUrl);

const providerErrorMessage = (provider, cloudflare) => {
    if (provider === 'pollinations') {
        return 'Set POLLINATIONS_API_KEY (from enter.pollinations.ai/keys) on the server to generate images.';
    }
    if (cloudflare) {
        return 'Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_KEY on the server to use Cloudflare.';
    }
    return 'Set IMAGE_API_KEY or configure Cloudflare on the server to generate images.';
};

const mapHttpStatusForClient = (status) => {
    if ([400, 401, 402, 403, 404, 409, 422, 429].includes(status)) return status;
    if (status >= 500) return 502;
    return 502;
};

const extractOpenAiErrorMessage = (data) => {
    if (data?.error?.message) return String(data.error.message);
    if (data?.message) return String(data.message);
    return null;
};

const generateImage = async (req, res) => {
    console.log('[IMAGE] Request received');

    const prompt = typeof req.body.prompt === 'string' ? req.body.prompt.trim() : '';
    if (!prompt || prompt.length > 4000) {
        return res.status(400).json({ message: 'Describe your image using 1 to 4000 characters.' });
    }

    const promptPayload = buildImagePromptPayload(req.body);
    const generationPrompt = promptPayload.enhancedPrompt;
    console.log('[IMAGE] User prompt length:', promptPayload.userPrompt.length);
    console.log('[IMAGE] Enhanced prompt length:', generationPrompt.length);

    const resolved = resolveImageProvider();
    const { provider, apiKey, cloudflareConfigured, account, cloudflareKey } = resolved;
    const model = provider === 'pollinations'
        ? String(process.env.POLLINATIONS_IMAGE_MODEL || 'flux').trim()
        : provider === 'openai'
            ? String(process.env.IMAGE_MODEL || 'gpt-image-1').trim()
            : String(process.env.CLOUDFLARE_IMAGE_MODEL || '@cf/black-forest-labs/flux-1-schnell').trim();

    console.log('[IMAGE] Provider:', provider);
    console.log('[IMAGE] API key configured:', Boolean(getPollinationsApiKey()));
    console.log('[IMAGE] Model:', model);
    console.log('[IMAGE] IMAGE_PROVIDER env:', String(process.env.IMAGE_PROVIDER || '').trim() || '(unset)');

    if (provider === 'none') {
        return res.status(503).json({ message: providerErrorMessage(provider, cloudflareConfigured) });
    }
    if (provider === 'pollinations' && !getPollinationsApiKey()) {
        return res.status(503).json({ message: providerErrorMessage('pollinations', false) });
    }
    if (provider === 'cloudflare' && (!account || !cloudflareKey)) {
        return res.status(503).json({ message: providerErrorMessage('cloudflare', true) });
    }
    if (provider === 'openai' && !apiKey) {
        return res.status(503).json({ message: providerErrorMessage('openai', false) });
    }

    try {
        if (provider === 'pollinations') {
            const { response, data, model: pollinationsModel, rawText } = await generatePollinationsImage(generationPrompt, {
                size: promptPayload.aspectSize,
            });
            if (!response.ok || data?.success === false) {
                const detail = extractPollinationsErrorMessage(data, response, rawText);
                return res.status(mapHttpStatusForClient(response.status)).json({
                    message: detail,
                    provider: 'pollinations',
                    upstreamStatus: response.status,
                });
            }

            const image = data?.data?.[0];
            const base64 = image?.b64_json;
            const imageUrl = base64
                ? `data:image/png;base64,${base64}`
                : image?.url;
            if (!safeImageUrl(imageUrl)) {
                console.log('[IMAGE] Pollinations success status but missing image payload');
                return res.status(502).json({
                    message: 'Pollinations did not return image data in the response.',
                    provider: 'pollinations',
                    upstreamStatus: response.status,
                });
            }
            return res.json({
                imageUrl,
                prompt: promptPayload.userPrompt,
                provider: 'pollinations',
                model: pollinationsModel,
                style: promptPayload.style,
                aspectRatio: promptPayload.aspectRatio,
                quality: promptPayload.quality,
            });
        }

        const cloudflare = provider === 'cloudflare';
        const upstreamUrl = cloudflare
            ? `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/ai/run/${process.env.CLOUDFLARE_IMAGE_MODEL || '@cf/black-forest-labs/flux-1-schnell'}`
            : process.env.IMAGE_API_URL || 'https://api.openai.com/v1/images/generations';
        console.log('[IMAGE] Sending request to', provider, 'endpoint:', upstreamUrl);

        const started = Date.now();
        const response = await fetch(upstreamUrl, {
            method: 'POST',
            signal: AbortSignal.timeout(180000),
            headers: { Authorization: `Bearer ${cloudflare ? cloudflareKey : apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(cloudflare ? { prompt: generationPrompt.slice(0, 2048), steps: 4 } : {
                model: process.env.IMAGE_MODEL || 'gpt-image-1',
                prompt: generationPrompt,
                size: promptPayload.aspectSize || process.env.IMAGE_SIZE || '1024x1024',
                n: 1,
            }),
        });
        const contentType = response.headers.get('content-type') || '';
        const data = contentType.includes('application/json')
            ? await response.json().catch(() => null)
            : null;
        console.log('[IMAGE]', provider, 'response status:', response.status);
        console.log('[IMAGE]', provider, 'content-type:', contentType || '(none)');
        console.log('[IMAGE]', provider, 'request durationMs:', Date.now() - started);
        if (!response.ok || data?.success === false) {
            const detail = extractOpenAiErrorMessage(data) || `${provider} HTTP ${response.status}`;
            console.log('[IMAGE]', provider, 'error:', detail);
            return res.status(mapHttpStatusForClient(response.status)).json({
                message: detail,
                provider,
                upstreamStatus: response.status,
            });
        }
        const image = data?.data?.[0];
        const base64 = cloudflare ? data?.result?.image : image?.b64_json;
        const imageUrl = base64 ? `data:image/${cloudflare ? 'jpeg' : 'png'};base64,${base64}` : image?.url;
        if (!safeImageUrl(imageUrl)) {
            return res.status(502).json({ message: 'The service did not return an image. Please try again.', provider });
        }
        return res.json({
            imageUrl,
            prompt: promptPayload.userPrompt,
            provider: cloudflare ? 'cloudflare' : 'openai',
            style: promptPayload.style,
            aspectRatio: promptPayload.aspectRatio,
            quality: promptPayload.quality,
        });
    } catch (error) {
        console.log('[IMAGE] Request failed:', error.name, error.message);
        return res.status(error.name === 'TimeoutError' ? 504 : 502).json({ message: error.name === 'TimeoutError'
            ? 'Image generation took too long. Please try again.'
            : 'Could not connect to the image generation service.' });
    }
};

const getImageGenerationStatus = (_req, res) => {
    const resolved = resolveImageProvider();
    const pollinationsKey = getPollinationsApiKey();
    return res.status(200).json({
        provider: resolved.provider,
        configured: resolved.provider !== 'none',
        pollinations: Boolean(pollinationsKey),
        model: resolved.provider === 'pollinations'
            ? String(process.env.POLLINATIONS_IMAGE_MODEL || 'flux').trim()
            : resolved.provider === 'openai'
                ? String(process.env.IMAGE_MODEL || 'gpt-image-1').trim()
                : resolved.provider === 'cloudflare'
                    ? String(process.env.CLOUDFLARE_IMAGE_MODEL || '@cf/black-forest-labs/flux-1-schnell').trim()
                    : null,
        docsUrl: 'https://enter.pollinations.ai/keys',
    });
};

module.exports = { generateImage, getImageGenerationStatus };
