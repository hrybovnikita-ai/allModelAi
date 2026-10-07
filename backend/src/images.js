const { getPollinationsApiKey } = require('./pollinations');
const { buildImagePromptPayload } = require('./enhanceImagePrompt');
const {
    parseQuality,
    parseAspect,
    parseStyle,
    redactSecrets,
    capabilitySummary,
    upscaleWithExternalProvider,
} = require('./imageProviderAdapter');
const {
    generateImageWithFallback,
    listConfiguredImageProviders,
    isProviderConfigured,
    safeImageUrl,
    resolveImageProvider,
    USER_UNAVAILABLE_MESSAGE,
} = require('./services/imageGenerationService');

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

    if (validation.value.provider) {
        const allowed = listConfiguredImageProviders();
        if (!allowed.includes(validation.value.provider)) {
            return res.status(400).json({ message: 'The requested image provider is not configured on this server.' });
        }
    }

    const providers = listConfiguredImageProviders();
    if (!providers.length) {
        return res.status(503).json({
            success: false,
            code: 'IMAGE_GENERATION_UNAVAILABLE',
            message: USER_UNAVAILABLE_MESSAGE,
        });
    }

    try {
        const result = await generateImageWithFallback({
            generationPrompt,
            promptPayload,
            quality: promptPayload.quality,
            aspectRatio: promptPayload.aspectRatio,
            requestedModel: validation.value.model,
        });

        return res.status(result.clientStatus).json(result.body);
    } catch (error) {
        console.log('[IMAGE] Request failed:', error.name, redactSecrets(error.message));
        return res.status(error.name === 'TimeoutError' ? 504 : 503).json({
            success: false,
            code: 'IMAGE_GENERATION_UNAVAILABLE',
            message: USER_UNAVAILABLE_MESSAGE,
        });
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
            return res.status(result.status >= 500 ? 502 : (result.status || 502)).json({
                message: 'Could not upscale the image. Please try again.',
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
    const providers = listConfiguredImageProviders();
    const primary = providers[0] || resolveImageProvider().provider;
    const pollinationsKey = getPollinationsApiKey();
    const capabilities = primary && primary !== 'none' ? capabilitySummary(primary) : null;
    return res.status(200).json({
        provider: primary || 'none',
        providers,
        configured: providers.length > 0,
        pollinations: Boolean(pollinationsKey),
        openai: isProviderConfigured('openai'),
        cloudflare: isProviderConfigured('cloudflare'),
        model: configuredModel(primary),
        upscaleSupported: Boolean(capabilities?.upscaleSupported),
        qualities: capabilities?.qualities || ['standard', 'hd', 'ultra'],
        aspects: capabilities?.aspects || ['1:1', '16:9', '9:16'],
        sizes: capabilities?.sizes || null,
        maxResolution: capabilities?.maxResolution || null,
        qualityModels: capabilities?.qualityModels || null,
    });
};

module.exports = { generateImage, getImageGenerationStatus, upscaleGeneratedImage };
