const {
    resolveImageProvider,
    generatePollinationsImage,
    getPollinationsApiKey,
    extractPollinationsErrorMessage,
} = require('./pollinations');
const { buildImagePromptPayload } = require('./enhanceImagePrompt');
const {
    parseQuality,
    parseAspect,
    parseStyle,
    redactSecrets,
    sniffImageMime,
    buildImageGenerationPlan,
    capabilitySummary,
    upscaleWithExternalProvider,
} = require('./imageProviderAdapter');

const safeImageUrl = (imageUrl) =>
    typeof imageUrl === 'string'
    && imageUrl.length < 25_000_000
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
    if (data?.error?.message) return redactSecrets(data.error.message);
    if (data?.message) return redactSecrets(data.message);
    return null;
};

const configuredModel = (provider) => {
    if (provider === 'pollinations') return String(process.env.POLLINATIONS_IMAGE_MODEL || 'flux').trim();
    if (provider === 'openai') return String(process.env.IMAGE_MODEL || 'gpt-image-1').trim();
    if (provider === 'cloudflare') return String(process.env.CLOUDFLARE_IMAGE_MODEL || '@cf/black-forest-labs/flux-1-schnell').trim();
    return null;
};

const validateImageInput = (body = {}) => {
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    if (!prompt || prompt.length > 4000) {
        return { error: 'Describe your image using 1 to 4000 characters.' };
    }
    if (body.quality != null && body.quality !== '' && !parseQuality(body.quality, { strict: true })) {
        return { error: 'Quality must be Standard, HD, or Ultra.' };
    }
    if (body.aspectRatio != null && body.aspectRatio !== '' && !parseAspect(body.aspectRatio, { strict: true })) {
        return { error: 'Aspect ratio must be square (1:1), landscape (16:9), or portrait (9:16).' };
    }
    if (body.style != null && body.style !== '' && !parseStyle(body.style, { strict: true })) {
        return { error: 'Style is not supported.' };
    }
    if (body.model != null && body.model !== '' && typeof body.model !== 'string') {
        return { error: 'Image model must be a string.' };
    }
    if (body.provider != null && body.provider !== '' && typeof body.provider !== 'string') {
        return { error: 'Image provider must be a string.' };
    }
    return {
        value: {
            prompt,
            quality: parseQuality(body.quality),
            aspectRatio: parseAspect(body.aspectRatio),
            style: parseStyle(body.style),
            model: typeof body.model === 'string' ? body.model.trim() : '',
            provider: typeof body.provider === 'string' ? body.provider.trim().toLowerCase() : '',
        },
    };
};

const mimeFromImageUrl = (imageUrl, base64) => {
    const dataMime = /^data:(image\/[a-z0-9.+-]+);base64,/i.exec(imageUrl);
    if (base64) return sniffImageMime(base64);
    if (dataMime) return dataMime[1].toLowerCase();
    return 'image/png';
};

const imageResponse = ({ imageUrl, promptPayload, plan, mimeType }) => ({
    imageUrl,
    prompt: promptPayload.userPrompt,
    provider: plan.provider,
    model: plan.model,
    style: promptPayload.style,
    aspectRatio: plan.aspectRatio,
    quality: plan.quality,
    size: plan.size,
    mimeType,
    upscaleSupported: plan.upscaleSupported,
});

const generateImage = async (req, res) => {
    console.log('[IMAGE] Request received');
    const validation = validateImageInput(req.body || {});
    if (validation.error) {
        console.log('[IMAGE] Rejected request:', validation.error);
        return res.status(400).json({ message: validation.error });
    }

    const promptPayload = buildImagePromptPayload({
        ...req.body,
        prompt: validation.value.prompt,
        quality: validation.value.quality,
        aspectRatio: validation.value.aspectRatio,
        style: validation.value.style,
    });
    const generationPrompt = promptPayload.enhancedPrompt;
    console.log('[IMAGE] User prompt length:', promptPayload.userPrompt.length);
    console.log('[IMAGE] Enhanced prompt length:', generationPrompt.length);
    console.log('[IMAGE] Quality:', promptPayload.quality);
    console.log('[IMAGE] Aspect:', promptPayload.aspectRatio);

    const resolved = resolveImageProvider();
    const { provider, apiKey, cloudflareConfigured, account, cloudflareKey } = resolved;
    console.log('[IMAGE] Provider:', provider);
    console.log('[IMAGE] API key configured:', provider === 'pollinations' ? Boolean(getPollinationsApiKey()) : Boolean(apiKey || cloudflareKey));
    console.log('[IMAGE] IMAGE_PROVIDER env:', String(process.env.IMAGE_PROVIDER || '').trim() || '(unset)');

    if (validation.value.provider && validation.value.provider !== provider) {
        return res.status(400).json({ message: 'Image provider does not match the server configuration.' });
    }
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

    const plan = buildImageGenerationPlan({
        provider,
        quality: promptPayload.quality,
        aspectRatio: promptPayload.aspectRatio,
        requestedModel: validation.value.model,
    });
    if (plan.error) {
        console.log('[IMAGE] Rejected model:', plan.error);
        return res.status(400).json({ message: plan.error });
    }

    console.log('[IMAGE] Model:', plan.model);
    console.log('[IMAGE] Size:', plan.size || '(provider default)');
    console.log('[IMAGE] Upscale supported:', plan.upscaleSupported);

    try {
        if (provider === 'pollinations') {
            const { response, data, model: pollinationsModel } = await generatePollinationsImage(generationPrompt, plan.request);
            if (!response.ok || data?.success === false) {
                const detail = extractPollinationsErrorMessage(data, response);
                return res.status(mapHttpStatusForClient(response.status)).json({
                    message: detail,
                    provider: 'pollinations',
                    upstreamStatus: response.status,
                });
            }

            const image = data?.data?.[0];
            const base64 = image?.b64_json;
            const mimeType = base64 ? sniffImageMime(base64) : mimeFromImageUrl(image?.url);
            const imageUrl = base64 ? `data:${mimeType};base64,${base64}` : image?.url;
            if (!safeImageUrl(imageUrl)) {
                console.log('[IMAGE] Pollinations success status but missing image payload');
                return res.status(502).json({
                    message: 'Pollinations did not return image data in the response.',
                    provider: 'pollinations',
                    upstreamStatus: response.status,
                });
            }
            return res.json(imageResponse({
                imageUrl,
                promptPayload,
                plan: { ...plan, model: pollinationsModel || plan.model },
                mimeType,
            }));
        }

        const cloudflare = provider === 'cloudflare';
        const upstreamUrl = cloudflare
            ? `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/ai/run/${encodeURIComponent(plan.model)}`
            : process.env.IMAGE_API_URL || 'https://api.openai.com/v1/images/generations';
        const upstreamBody = cloudflare
            ? { prompt: generationPrompt.slice(0, plan.maxPromptLength), steps: plan.request.steps }
            : { ...plan.request, prompt: generationPrompt.slice(0, plan.maxPromptLength) };

        console.log('[IMAGE] Sending request to', provider);
        console.log('[IMAGE] Upstream parameter keys:', Object.keys(upstreamBody).join(','));

        const started = Date.now();
        const response = await fetch(upstreamUrl, {
            method: 'POST',
            signal: AbortSignal.timeout(180000),
            headers: { Authorization: `Bearer ${cloudflare ? cloudflareKey : apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(upstreamBody),
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
        const mimeType = base64
            ? sniffImageMime(base64, cloudflare ? 'image/jpeg' : 'image/png')
            : mimeFromImageUrl(image?.url);
        const imageUrl = base64 ? `data:${mimeType};base64,${base64}` : image?.url;
        if (!safeImageUrl(imageUrl)) {
            return res.status(502).json({ message: 'The service did not return an image. Please try again.', provider });
        }
        return res.json(imageResponse({ imageUrl, promptPayload, plan, mimeType }));
    } catch (error) {
        console.log('[IMAGE] Request failed:', error.name, redactSecrets(error.message));
        return res.status(error.name === 'TimeoutError' ? 504 : 502).json({ message: error.name === 'TimeoutError'
            ? 'Image generation took too long. Please try again.'
            : 'Could not connect to the image generation service.' });
    }
};

const upscaleGeneratedImage = async (req, res) => {
    const imageUrl = req.body?.imageUrl;
    if (!safeImageUrl(imageUrl)) {
        return res.status(400).json({ message: 'A generated image is required before upscaling.' });
    }
    console.log('[IMAGE] Upscale requested. Payload bytes:', imageUrl.length);
    try {
        const result = await upscaleWithExternalProvider(imageUrl);
        if (!result.supported) {
            console.log('[IMAGE] Upscale unavailable for the active provider');
            return res.status(501).json({
                message: 'Upscaling is not available for the current image provider. Set UPSCALE_API_URL and UPSCALE_API_KEY to connect an external upscaler.',
                upscaleSupported: false,
            });
        }
        if (!result.ok || !safeImageUrl(result.imageUrl)) {
            console.log('[IMAGE] Upscale failed:', result.status || 502);
            return res.status(mapHttpStatusForClient(result.status || 502)).json({
                message: result.message || 'Could not upscale the image.',
                upscaleSupported: true,
            });
        }
        console.log('[IMAGE] Upscale completed');
        return res.json({
            imageUrl: result.imageUrl,
            mimeType: result.mimeType,
            upscaleSupported: true,
        });
    } catch (error) {
        console.log('[IMAGE] Upscale request failed:', error.name, redactSecrets(error.message));
        return res.status(error.name === 'TimeoutError' ? 504 : 502).json({
            message: 'Could not connect to the upscaling service.',
        });
    }
};

const getImageGenerationStatus = (_req, res) => {
    const resolved = resolveImageProvider();
    const pollinationsKey = getPollinationsApiKey();
    const capabilities = resolved.provider === 'none' ? null : capabilitySummary(resolved.provider);
    return res.status(200).json({
        provider: resolved.provider,
        configured: resolved.provider !== 'none',
        pollinations: Boolean(pollinationsKey),
        model: configuredModel(resolved.provider),
        docsUrl: 'https://enter.pollinations.ai/keys',
        upscaleSupported: Boolean(capabilities?.upscaleSupported),
        qualities: capabilities?.qualities || ['standard', 'hd', 'ultra'],
        aspects: capabilities?.aspects || ['1:1', '16:9', '9:16'],
        sizes: capabilities?.sizes || null,
        maxResolution: capabilities?.maxResolution || null,
        qualityModels: capabilities?.qualityModels || null,
    });
};

module.exports = { generateImage, getImageGenerationStatus, upscaleGeneratedImage };
