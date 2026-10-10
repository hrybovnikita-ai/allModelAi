const { getPollinationsApiKey } = require('./pollinations');
const { buildImagePromptPayload } = require('./enhanceImagePrompt');
const {
    parseQuality,
    parseAspect,
    parseStyle,
    parseImageCount,
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
const { imageConfigurationReport, imageGenerationHealth } = require('./imageConfig');
const { resolveExplicitImageProvider } = require('./services/imageGenerationService');
const { isComfyCloudConfigured } = require('./comfyCloud');
const {
    createImageJob,
    getImageJob,
    publicJobPayload,
    updateImageJob,
} = require('./services/imageJobService');

const configuredModel = (provider) => {
    if (provider === 'comfy-cloud') return String(process.env.COMFY_CLOUD_CHECKPOINT || 'flux1-schnell-fp8.safetensors').trim();
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
    const imageCount = parseImageCount(body.count ?? body.imageCount, { strict: true });
    if (imageCount == null) {
        return { error: 'Image count must be 1, 2, 3, or 4.' };
    }
    return {
        value: {
            prompt,
            quality: parseQuality(body.quality),
            aspectRatio: parseAspect(body.aspectRatio),
            style: parseStyle(body.style),
            model: typeof body.model === 'string' ? body.model.trim() : '',
            provider: typeof body.provider === 'string' ? body.provider.trim().toLowerCase() : '',
            imageCount,
        },
    };
};

const runImageGenerationJob = async (jobId, params) => {
    const jobStartedAt = Date.now();
    updateImageJob(jobId, { status: 'processing' });
    console.log('[IMAGE] Job started', { jobId });
    try {
        const result = await generateImageWithFallback({
            ...params,
            jobId,
            onProgress: (progress) => updateImageJob(jobId, { progress }),
        });
        if (result.ok) {
            updateImageJob(jobId, {
                status: 'completed',
                result: result.body,
                durationMs: Date.now() - jobStartedAt,
            });
            console.log('[IMAGE] Job completed', { jobId, durationMs: Date.now() - jobStartedAt });
            return;
        }
        updateImageJob(jobId, {
            status: 'failed',
            durationMs: Date.now() - jobStartedAt,
            error: {
                code: result.body?.code || 'IMAGE_GENERATION_UNAVAILABLE',
                message: result.body?.message || USER_UNAVAILABLE_MESSAGE,
                retryable: result.body?.retryable !== false,
                missingEnvVars: result.body?.missingEnvVars,
            },
        });
        console.log('[IMAGE] Job failed', {
            jobId,
            durationMs: Date.now() - jobStartedAt,
            code: result.body?.code,
            retryable: result.body?.retryable !== false,
        });
    } catch (error) {
        console.error('[IMAGE] Async job failed:', jobId, error.name, redactSecrets(error.message));
        updateImageJob(jobId, {
            status: 'failed',
            durationMs: Date.now() - jobStartedAt,
            error: {
                code: 'IMAGE_GENERATION_UNAVAILABLE',
                message: USER_UNAVAILABLE_MESSAGE,
                retryable: error.name === 'TimeoutError',
            },
        });
    }
};

const logImageConfigSnapshot = () => {
    try {
        const health = imageGenerationHealth();
        console.log('[IMAGE] Config snapshot', {
            configured: health.configured,
            explicitProvider: health.explicitProvider || null,
            activeProviders: health.providers || [],
            cloudflareReady: Boolean(health.cloudflare?.ready),
            cloudflareAccountIdPresent: Boolean(health.cloudflare?.accountIdPresent),
            cloudflareTokenPresent: Boolean(health.cloudflare?.tokenPresent),
            cloudflareModel: health.cloudflare?.model || null,
            missingEnvVars: health.missingEnvVars?.length ? health.missingEnvVars : undefined,
        });
    } catch (error) {
        console.warn('[IMAGE] Config snapshot unavailable:', error.name);
    }
};

const generateImage = async (req, res) => {
    try {
        console.log('[IMAGE] Request received');
        logImageConfigSnapshot();
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

        const config = imageConfigurationReport();
        const providers = config.providers?.length ? config.providers : listConfiguredImageProviders();
        if (!providers.length) {
            const explicitRaw = String(process.env.IMAGE_GENERATION_PROVIDER || process.env.IMAGE_PROVIDER || '').trim().toLowerCase();
            const explicit = explicitRaw === 'comfy' ? 'comfy-cloud' : explicitRaw;
            if (explicit === 'comfy-cloud' && !isComfyCloudConfigured()) {
                console.error('[API Error] COMFY_CLOUD_API_KEY is not set');
            }
            if (explicit === 'cloudflare' && !isProviderConfigured('cloudflare')) {
                console.error('[API Error] Cloudflare Workers AI image generation is not fully configured (check CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN on Render)');
            }
            const status = explicit === 'comfy-cloud' && !isComfyCloudConfigured() ? 500 : 502;
            return res.status(status).json({
                success: false,
                code: config.code || 'IMAGE_NOT_CONFIGURED',
                message: config.message || USER_UNAVAILABLE_MESSAGE,
                missingEnvVars: config.missing?.length ? config.missing : undefined,
                configurationWarnings: config.warnings?.length ? config.warnings : undefined,
            });
        }

        const generationParams = {
            generationPrompt,
            promptPayload,
            quality: promptPayload.quality,
            aspectRatio: promptPayload.aspectRatio,
            requestedModel: validation.value.model,
            preferredProvider: validation.value.provider || '',
            imageCount: validation.value.imageCount,
        };

        const wantsSync = req.body?.async === false || req.body?.async === 'false';

        if (!wantsSync) {
            const job = createImageJob({
                userId: req.user?.id,
                ...generationParams,
                imageCount: validation.value.imageCount,
            });
            void runImageGenerationJob(job.id, generationParams);
            return res.status(202).json({
                success: true,
                jobId: job.id,
                status: 'processing',
            });
        }

        const result = await generateImageWithFallback(generationParams);
        return res.status(result.clientStatus).json(result.body);
    } catch (error) {
        console.error('[IMAGE] Request failed:', error.name, redactSecrets(error.message));
        return res.status(error.name === 'TimeoutError' ? 504 : 502).json({
            success: false,
            code: 'IMAGE_GENERATION_UNAVAILABLE',
            message: USER_UNAVAILABLE_MESSAGE,
            retryable: true,
        });
    }
};

const getImageGenerationJob = (req, res) => {
    const job = getImageJob(req.params.jobId, req.user?.id);
    if (!job) {
        return res.status(404).json({ success: false, message: 'Image job not found or expired.' });
    }
    const payload = publicJobPayload(job);
    return res.status(200).json(payload);
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
    const config = imageConfigurationReport();
    const providers = config.providers?.length ? config.providers : listConfiguredImageProviders();
    const explicit = resolveExplicitImageProvider();
    const primary = providers[0]
        || (explicit && isProviderConfigured(explicit) ? explicit : null)
        || explicit
        || resolveImageProvider().provider;
    const pollinationsKey = getPollinationsApiKey();
    const capabilities = primary && primary !== 'none' ? capabilitySummary(primary) : null;
    return res.status(200).json({
        provider: primary || 'none',
        providers,
        configured: providers.length > 0,
        comfyCloud: isProviderConfigured('comfy-cloud'),
        pollinations: isProviderConfigured('pollinations'),
        openai: isProviderConfigured('openai'),
        cloudflare: isProviderConfigured('cloudflare'),
        model: configuredModel(primary),
        upscaleSupported: Boolean(capabilities?.upscaleSupported),
        qualities: capabilities?.qualities || ['standard', 'hd', 'ultra'],
        aspects: capabilities?.aspects || ['1:1', '16:9', '9:16'],
        sizes: capabilities?.sizes || null,
        maxResolution: capabilities?.maxResolution || null,
        qualityModels: capabilities?.qualityModels || null,
        maxImageCount: capabilities?.maxImageCount || 4,
        imageCountOptions: capabilities?.imageCountOptions || [1, 2, 3, 4],
        batchInSingleRequest: capabilities?.batchInSingleRequest === true,
        maxBatchCount: capabilities?.maxBatchCount || 1,
        multiImageBillingNote: capabilities?.multiImageBillingNote || null,
        configuration: {
            ok: config.ok,
            code: config.code || null,
            missingEnvVars: config.missing || [],
            warnings: config.warnings || [],
        },
        pollinationsKeyPresent: Boolean(pollinationsKey),
    });
};

module.exports = {
    generateImage,
    getImageGenerationStatus,
    getImageGenerationJob,
    upscaleGeneratedImage,
};
