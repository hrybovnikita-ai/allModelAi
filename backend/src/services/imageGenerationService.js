/**
 * Multi-provider image generation with ordered fallback.
 */

const {
    generatePollinationsImage,
    getPollinationsApiKey,
    isPollinationsKey,
    extractPollinationsErrorMessage,
    resolveImageProvider,
} = require('../pollinations');
const { ComfyCloudError, generateComfyCloudImage, isComfyCloudConfigured } = require('../comfyCloud');
const {
    buildImageGenerationPlan,
    imageBatchCapabilities,
    parseImageCount,
    redactSecrets,
    sniffImageMime,
} = require('../imageProviderAdapter');

const SEQUENTIAL_IMAGE_CONCURRENCY = 2;
const {
    generateCloudflareWorkersAiImage,
    isCloudflareImageConfigured,
} = require('./cloudflareImageService');

const LOG_PREFIX = '[AllModelAI][IMAGE]';
const USER_UNAVAILABLE_MESSAGE = 'Image generation is temporarily unavailable. Please try again in a moment.';
const FAILURE_CODE = 'IMAGE_GENERATION_UNAVAILABLE';

const strip = (value) => String(value || '').trim().replace(/^["']|["']$/g, '');

const safeImageUrl = (imageUrl) =>
    typeof imageUrl === 'string'
    && imageUrl.length < 25_000_000
    && /^(https:\/\/|data:image\/(png|jpeg|webp);base64,)/.test(imageUrl);

const parseSizeDimensions = (size) => {
    const match = String(size || '').match(/^(\d+)x(\d+)$/);
    if (!match) return { width: null, height: null };
    return { width: Number(match[1]), height: Number(match[2]) };
};

const getOpenAiImageKey = () => {
    const openAiKeys = [
        process.env.IMAGE_API_KEY,
        process.env.OPENAI_API_KEY,
        process.env.OPEN_AI_API_KEY,
        process.env.API_IMAGE_KEY,
    ]
        .map(strip)
        .filter(Boolean);
    if (process.env.IMAGE_API_URL) return openAiKeys[0] || null;
    return openAiKeys.find((value) => /^sk-/i.test(value) && !/^sk-or-/i.test(value)) || null;
};

const resolveExplicitImageProvider = () =>
    normalizeImageProviderId(process.env.IMAGE_GENERATION_PROVIDER || process.env.IMAGE_PROVIDER);

const normalizeImageProviderId = (provider) => {
    const key = strip(provider).toLowerCase();
    if (key === 'comfy' || key === 'comfy_cloud' || key === 'comfy-cloud') return 'comfy-cloud';
    return key;
};

const IMAGE_PROVIDER_IDS = ['comfy-cloud', 'pollinations', 'openai', 'cloudflare'];

const isProviderConfigured = (provider) => {
    const id = normalizeImageProviderId(provider);
    if (id === 'comfy-cloud') return isComfyCloudConfigured();
    if (id === 'pollinations') {
        const key = getPollinationsApiKey();
        return Boolean(key && isPollinationsKey(key));
    }
    if (id === 'openai') return Boolean(getOpenAiImageKey());
    if (id === 'cloudflare') return isCloudflareImageConfigured();
    return false;
};

const listConfiguredImageProviders = () => {
    const explicit = resolveExplicitImageProvider();
    const ordered = [];
    const pushUnique = (name) => {
        const id = normalizeImageProviderId(name);
        if (!id || ordered.includes(id)) return;
        if (isProviderConfigured(id)) ordered.push(id);
    };

    if (explicit && IMAGE_PROVIDER_IDS.includes(explicit)) {
        pushUnique(explicit);
        if (process.env.IMAGE_ALLOW_FALLBACK === 'true') {
            IMAGE_PROVIDER_IDS.forEach((name) => {
                if (name !== explicit) pushUnique(name);
            });
        }
        return ordered;
    }

    IMAGE_PROVIDER_IDS.forEach((name) => pushUnique(name));
    return ordered;
};

const classifyProviderFailure = (status, message) => {
    const s = Number(status);
    const blob = String(message || '').toLowerCase();
    if (s === 504 || /timeout|timed out|aborterror/.test(blob)) return 'TIMEOUT';
    if (s === 429 || /rate limit|too many requests/.test(blob)) return 'RATE_LIMIT';
    if (s === 402 || /insufficient balance|pollen|no credits remaining|billing/.test(blob)) return 'QUOTA';
    if (s === 403 && /free tier|not available for free/.test(blob)) return 'AUTH_TIER';
    if (s === 401 || s === 403) return 'AUTH';
    if (s === 400) return 'INVALID';
    if (s >= 500) return 'UPSTREAM';
    return 'UNKNOWN';
};

/** Retry the same provider (not “try next provider”). Quota/auth failures should not loop. */
const isRetryableProviderFailure = ({ status, code, message }) => {
    const category = classifyProviderFailure(status, message);
    if (category === 'INVALID') return false;
    if (category === 'QUOTA' || category === 'AUTH_TIER' || category === 'AUTH') return false;
    if ([408, 500, 502, 503, 504].includes(Number(status))) return true;
    if (Number(status) === 429 || category === 'RATE_LIMIT') return true;
    const blob = String(message || code || '').toLowerCase();
    if (/timeout|unavailable|temporarily|upstream/.test(blob)) return true;
    return false;
};

const attemptsAreProviderExhausted = (attempts) => {
    if (!attempts.length) return false;
    return attempts.every((attempt) => {
        const category = classifyProviderFailure(attempt.status, attempt.message);
        return ['QUOTA', 'AUTH_TIER', 'AUTH'].includes(category);
    });
};

const logImage = (message, extra) => {
    if (extra && Object.keys(extra).length) {
        console.log(`${LOG_PREFIX} ${message}`, extra);
        return;
    }
    console.log(`${LOG_PREFIX} ${message}`);
};

/** Try the next configured provider unless this failure invalidates the whole request. */
const shouldAdvanceToNextProvider = (result, providerIndex, providerCount) => {
    if (result.ok) return false;
    if (result.status === 400) return false;
    return providerIndex < providerCount - 1;
};

const mimeFromImageUrl = (imageUrl, base64) => {
    const dataMime = /^data:(image\/[a-z0-9.+-]+);base64,/i.exec(imageUrl);
    if (base64) return sniffImageMime(base64);
    if (dataMime) return dataMime[1].toLowerCase();
    return 'image/png';
};

const extractOpenAiErrorMessage = (data) => {
    if (data?.error?.message) return redactSecrets(data.error.message);
    if (data?.message) return redactSecrets(data.message);
    return null;
};

const imagesFromOpenAiStyleData = (data) => {
    const entries = Array.isArray(data?.data) ? data.data : [];
    return entries.map((image) => {
        const base64 = image?.b64_json;
        const mimeType = base64 ? sniffImageMime(base64) : mimeFromImageUrl(image?.url);
        const imageUrl = base64 ? `data:${mimeType};base64,${base64}` : image?.url;
        return safeImageUrl(imageUrl) ? { imageUrl, mimeType } : null;
    }).filter(Boolean);
};

const normalizeSuccessPayload = ({
    imageUrl,
    images,
    provider,
    model,
    size,
    mimeType,
    promptPayload,
    plan,
    requestedCount,
    partial,
    warnings,
}) => {
    const { width, height } = parseSizeDimensions(size || plan.size);
    const normalizedImages = (images?.length ? images : [{ imageUrl, mimeType }]).filter((item) => safeImageUrl(item.imageUrl));
    const primary = normalizedImages[0];
    return {
        success: true,
        imageUrl: primary?.imageUrl || imageUrl,
        images: normalizedImages,
        imageCount: normalizedImages.length,
        requestedCount: requestedCount || normalizedImages.length,
        partial: partial === true,
        warnings: warnings?.length ? warnings : undefined,
        provider,
        model,
        width,
        height,
        prompt: promptPayload.userPrompt,
        style: promptPayload.style,
        aspectRatio: plan.aspectRatio,
        quality: plan.quality,
        size: plan.size,
        mimeType: primary?.mimeType || mimeType,
        upscaleSupported: plan.upscaleSupported,
        batchInSingleRequest: plan.batchCapabilities?.batchInSingleRequest,
        multiImageBillingNote: plan.batchCapabilities?.billingNote,
    };
};

const reportImageProgress = (onProgress, patch) => {
    if (typeof onProgress === 'function') onProgress(patch);
};

async function generateWithProvider(provider, {
    generationPrompt,
    quality,
    aspectRatio,
    requestedModel,
    imageCount = 1,
}) {
    const plan = buildImageGenerationPlan({
        provider,
        quality,
        aspectRatio,
        requestedModel,
        imageCount,
    });
    if (plan.error) {
        return { ok: false, retryable: false, status: 400, internalMessage: plan.error, provider };
    }

    const openAiKey = getOpenAiImageKey();

    if (provider === 'cloudflare') {
        const cf = await generateCloudflareWorkersAiImage({
            prompt: generationPrompt.slice(0, plan.maxPromptLength),
            steps: plan.request.steps,
            model: plan.model,
        });
        if (!cf.ok) {
            return {
                ok: false,
                retryable: cf.retryable !== false,
                status: cf.clientStatus || cf.status || 502,
                internalMessage: cf.internalMessage,
                userMessage: cf.userMessage,
                code: cf.code,
                provider: 'cloudflare',
            };
        }
        if (!safeImageUrl(cf.imageUrl)) {
            return {
                ok: false,
                retryable: true,
                status: 502,
                internalMessage: 'Cloudflare returned no image payload',
                provider: 'cloudflare',
            };
        }
        const images = [{ imageUrl: cf.imageUrl, mimeType: cf.mimeType }];
        return {
            ok: true,
            imageUrl: cf.imageUrl,
            images,
            mimeType: cf.mimeType,
            plan,
            provider: 'cloudflare',
        };
    }

    if (provider === 'comfy-cloud') {
        try {
            const result = await generateComfyCloudImage({
                prompt: generationPrompt,
                size: plan.size,
                quality: plan.quality,
            });
            if (!safeImageUrl(result.imageUrl)) {
                return {
                    ok: false,
                    retryable: true,
                    status: 502,
                    internalMessage: 'Comfy Cloud returned no image payload',
                    provider: 'comfy-cloud',
                };
            }
            const images = [{ imageUrl: result.imageUrl, mimeType: result.mimeType }];
            return {
                ok: true,
                imageUrl: result.imageUrl,
                images,
                mimeType: result.mimeType,
                plan: { ...plan, model: result.model || plan.model },
                provider: 'comfy-cloud',
            };
        } catch (error) {
            const comfy = error instanceof ComfyCloudError ? error : null;
            const status = comfy?.status || 502;
            return {
                ok: false,
                retryable: status !== 400,
                status,
                internalMessage: redactSecrets(error.message),
                provider: 'comfy-cloud',
            };
        }
    }

    if (provider === 'pollinations') {
        const { response, data, model: pollinationsModel } = await generatePollinationsImage(
            generationPrompt,
            plan.request,
        );
        if (!response.ok || data?.success === false) {
            const detail = extractPollinationsErrorMessage(data, response);
            return {
                ok: false,
                retryable: isRetryableProviderFailure({ status: response.status, message: detail }),
                status: response.status,
                internalMessage: detail,
                provider: 'pollinations',
            };
        }
        const images = imagesFromOpenAiStyleData(data);
        if (!images.length) {
            return {
                ok: false,
                retryable: true,
                status: 502,
                internalMessage: 'Pollinations returned no image payload',
                provider: 'pollinations',
            };
        }
        return {
            ok: true,
            imageUrl: images[0].imageUrl,
            images,
            mimeType: images[0].mimeType,
            plan: { ...plan, model: pollinationsModel || plan.model },
            provider: 'pollinations',
        };
    }

    const upstreamUrl = process.env.IMAGE_API_URL || 'https://api.openai.com/v1/images/generations';
    const upstreamBody = { ...plan.request, prompt: generationPrompt.slice(0, plan.maxPromptLength) };

    const response = await fetch(upstreamUrl, {
        method: 'POST',
        signal: AbortSignal.timeout(180000),
        headers: {
            Authorization: `Bearer ${openAiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(upstreamBody),
    });
    const contentType = response.headers.get('content-type') || '';
    const data = contentType.includes('application/json')
        ? await response.json().catch(() => null)
        : null;

    if (!response.ok || data?.success === false) {
        const detail = extractOpenAiErrorMessage(data) || `${provider} HTTP ${response.status}`;
        return {
            ok: false,
            retryable: isRetryableProviderFailure({ status: response.status, message: detail }),
            status: response.status,
            internalMessage: detail,
            provider,
        };
    }

    const images = imagesFromOpenAiStyleData(data);
    if (!images.length) {
        return {
            ok: false,
            retryable: true,
            status: 502,
            internalMessage: `${provider} returned no image payload`,
            provider,
        };
    }

    return {
        ok: true,
        imageUrl: images[0].imageUrl,
        images,
        mimeType: images[0].mimeType,
        plan,
        provider,
    };
}

const isQuotaOrAuthFailure = (result) => {
    if (!result || result.ok) return false;
    const category = classifyProviderFailure(result.status, result.internalMessage);
    return category === 'QUOTA' || category === 'AUTH' || category === 'AUTH_TIER';
};

async function generateSequentialImagesWithProvider(provider, params, total, onProgress) {
    const images = [];
    const failures = [];
    let completed = 0;

    while (completed < total) {
        const chunkSize = Math.min(SEQUENTIAL_IMAGE_CONCURRENCY, total - completed);
        const chunk = await Promise.all(Array.from({ length: chunkSize }, async () => generateWithProvider(provider, {
            ...params,
            imageCount: 1,
        })));
        for (const result of chunk) {
            completed += 1;
            if (result.ok && result.images?.length) {
                images.push(...result.images);
            } else {
                failures.push(result);
                if (isQuotaOrAuthFailure(result)) break;
            }
            reportImageProgress(onProgress, {
                completed: images.length,
                total,
                failed: failures.length,
                mode: 'sequential',
            });
        }
        if (failures.some(isQuotaOrAuthFailure)) break;
    }

    return { images, failures };
}

async function generateImageWithFallback({
    generationPrompt,
    promptPayload,
    quality,
    aspectRatio,
    requestedModel,
    preferredProvider,
    jobId,
    imageCount: rawImageCount,
    onProgress,
}) {
    const imageCount = parseImageCount(rawImageCount);
    const startedAt = Date.now();
    const preferred = preferredProvider ? normalizeImageProviderId(preferredProvider) : '';
    const providers = preferred && isProviderConfigured(preferred)
        ? [preferred]
        : listConfiguredImageProviders();
    if (!providers.length) {
        logImage('No image providers configured');
        const { imageConfigurationReport } = require('../imageConfig');
        const config = imageConfigurationReport();
        return {
            ok: false,
            clientStatus: 502,
            body: {
                success: false,
                code: config.code || 'IMAGE_NOT_CONFIGURED',
                message: config.message || USER_UNAVAILABLE_MESSAGE,
                missingEnvVars: config.missing?.length ? config.missing : undefined,
                configurationWarnings: config.warnings?.length ? config.warnings : undefined,
            },
        };
    }

    logImage('Generation started', {
        jobId: jobId || undefined,
        providers: providers.join(' → '),
        imageCount,
    });
    const attempts = [];
    const providerParams = {
        generationPrompt,
        quality,
        aspectRatio,
    };

    for (let index = 0; index < providers.length; index += 1) {
        const provider = providers[index];
        logImage(`Trying provider: ${provider}`);
        try {
            const modelForCaps = buildImageGenerationPlan({
                provider,
                quality,
                aspectRatio,
                requestedModel: index === 0 ? requestedModel : '',
                imageCount: 1,
            }).model;
            const caps = imageBatchCapabilities(provider, modelForCaps);
            const useBatchRequest = imageCount > 1 && caps.batchInSingleRequest && imageCount <= caps.maxBatch;

            let result;
            if (imageCount === 1 || useBatchRequest) {
                result = await generateWithProvider(provider, {
                    ...providerParams,
                    requestedModel: index === 0 ? requestedModel : '',
                    imageCount: useBatchRequest ? imageCount : 1,
                });
            } else {
                const sequential = await generateSequentialImagesWithProvider(
                    provider,
                    { ...providerParams, requestedModel: index === 0 ? requestedModel : '' },
                    imageCount,
                    onProgress,
                );
                if (sequential.images.length) {
                    const partial = sequential.images.length < imageCount;
                    const warnings = partial
                        ? [`Generated ${sequential.images.length} of ${imageCount} images. ${caps.billingNote}`]
                        : undefined;
                    logImage('Generation completed (sequential)', {
                        jobId: jobId || undefined,
                        providerUsed: provider,
                        durationMs: Date.now() - startedAt,
                        imageCount: sequential.images.length,
                        partial,
                    });
                    const plan = buildImageGenerationPlan({
                        provider,
                        quality,
                        aspectRatio,
                        requestedModel: index === 0 ? requestedModel : '',
                        imageCount,
                    });
                    return {
                        ok: true,
                        clientStatus: partial ? 207 : 200,
                        body: normalizeSuccessPayload({
                            images: sequential.images,
                            provider,
                            model: plan.model,
                            size: plan.size,
                            mimeType: sequential.images[0].mimeType,
                            promptPayload,
                            plan,
                            requestedCount: imageCount,
                            partial,
                            warnings,
                        }),
                    };
                }
                result = sequential.failures[sequential.failures.length - 1] || {
                    ok: false,
                    retryable: true,
                    status: 502,
                    internalMessage: 'No images were generated',
                    provider,
                };
            }

            if (result.ok) {
                const images = result.images?.length
                    ? result.images
                    : [{ imageUrl: result.imageUrl, mimeType: result.mimeType }];
                const partial = images.length < imageCount;
                logImage('Generation completed', {
                    jobId: jobId || undefined,
                    providerUsed: provider,
                    durationMs: Date.now() - startedAt,
                    imageCount: images.length,
                    partial,
                });
                reportImageProgress(onProgress, {
                    completed: images.length,
                    total: imageCount,
                    failed: Math.max(0, imageCount - images.length),
                    mode: useBatchRequest ? 'batch' : 'single',
                });
                return {
                    ok: true,
                    clientStatus: partial ? 207 : 200,
                    body: normalizeSuccessPayload({
                        images,
                        provider: result.provider,
                        model: result.plan.model,
                        size: result.plan.size,
                        mimeType: result.mimeType,
                        promptPayload,
                        plan: result.plan,
                        requestedCount: imageCount,
                        partial,
                        warnings: partial
                            ? [`Generated ${images.length} of ${imageCount} images.`]
                            : undefined,
                    }),
                };
            }

            const category = classifyProviderFailure(result.status, result.internalMessage);
            attempts.push({
                provider,
                status: result.status,
                retryable: result.retryable,
                message: result.internalMessage,
                userMessage: result.userMessage,
                category,
            });
            logImage(`${provider} failed: ${result.status || 'error'}`, {
                jobId: jobId || undefined,
                category,
                retryable: result.retryable,
                detail: process.env.NODE_ENV === 'production' ? undefined : redactSecrets(result.internalMessage),
            });

            if (result.status === 400 || result.code === 'IMAGE_INVALID_REQUEST') {
                return {
                    ok: false,
                    clientStatus: 400,
                    body: {
                        success: false,
                        code: result.code || 'IMAGE_INVALID_REQUEST',
                        message: result.userMessage || result.internalMessage || 'Invalid image generation request.',
                    },
                };
            }
            if (['IMAGE_CLOUDFLARE_QUOTA', 'IMAGE_CLOUDFLARE_AUTH', 'IMAGE_CLOUDFLARE_FORBIDDEN', 'IMAGE_NOT_CONFIGURED'].includes(result.code)) {
                return {
                    ok: false,
                    clientStatus: result.status || 502,
                    body: {
                        success: false,
                        code: result.code,
                        message: result.userMessage || result.internalMessage || USER_UNAVAILABLE_MESSAGE,
                        retryable: result.retryable === true,
                    },
                };
            }
            if (!shouldAdvanceToNextProvider(result, index, providers.length)) {
                break;
            }
            logImage('Trying fallback provider');
        } catch (error) {
            const retryable = error.name === 'TimeoutError' || error.name === 'AbortError';
            const status = error.name === 'TimeoutError' ? 504 : 502;
            const category = classifyProviderFailure(status, error.message);
            attempts.push({
                provider,
                status,
                retryable,
                message: redactSecrets(error.message),
                category,
            });
            logImage(`${provider} failed: ${error.name}`, {
                jobId: jobId || undefined,
                category,
                detail: process.env.NODE_ENV === 'production' ? undefined : redactSecrets(error.message),
            });
            if (!shouldAdvanceToNextProvider({ ok: false, status: error.name === 'TimeoutError' ? 504 : 502 }, index, providers.length)) {
                break;
            }
            logImage('Trying fallback provider');
        }
    }

    const durationMs = Date.now() - startedAt;
    const exhausted = attemptsAreProviderExhausted(attempts);
    logImage('All providers failed', {
        jobId: jobId || undefined,
        durationMs,
        exhausted,
        attempts: attempts.map((a) => ({
            provider: a.provider,
            status: a.status,
            category: a.category || classifyProviderFailure(a.status, a.message),
        })),
    });

    const hadTimeout = attempts.some((a) => a.status === 504);
    const authFailure = attempts.find((a) => a.status === 403 || a.status === 401);
    const quotaFailure = attempts.find((a) => a.category === 'QUOTA' || a.status === 402);
    const rateFailure = attempts.find((a) => a.status === 429);
    const lastUserMessage = [...attempts].reverse().find((a) => a.userMessage)?.userMessage;
    let message = lastUserMessage || USER_UNAVAILABLE_MESSAGE;
    if (hadTimeout) {
        message = 'Image generation timed out. Try again with Standard quality or a shorter prompt.';
    } else if (authFailure && attempts.length === 1 && !lastUserMessage) {
        message = 'The primary image provider rejected the server API key. Check Comfy Cloud billing/tier or configure a fallback provider (Pollinations / OpenAI).';
    } else if (quotaFailure?.userMessage) {
        message = quotaFailure.userMessage;
    }
    const allAuthBlocked = attempts.length > 0 && attempts.every((a) => a.status === 401 || a.status === 403);
    const clientRetryable = !exhausted && !hadTimeout && !quotaFailure;
    const lastAttempt = attempts[attempts.length - 1];
    let clientStatus = 502;
    if (hadTimeout) clientStatus = 504;
    else if (rateFailure) clientStatus = 429;
    else if (quotaFailure) clientStatus = 402;
    else if (authFailure?.status === 500) clientStatus = 500;
    else if (lastAttempt?.status >= 400 && lastAttempt.status < 600) clientStatus = lastAttempt.status;

    let failureCode = exhausted ? 'IMAGE_PROVIDER_EXHAUSTED' : FAILURE_CODE;
    if (authFailure?.status === 500) failureCode = 'COMFY_CLOUD_NOT_CONFIGURED';
    if (attempts.length === 1 && attempts[0].provider === 'cloudflare') {
        if (attempts[0].category === 'QUOTA') failureCode = 'IMAGE_CLOUDFLARE_QUOTA';
        if (attempts[0].category === 'AUTH') failureCode = 'IMAGE_CLOUDFLARE_AUTH';
    }

    return {
        ok: false,
        clientStatus,
        body: {
            success: false,
            code: failureCode,
            message: allAuthBlocked && attempts.length > 1
                ? 'Image providers rejected the server API keys. Check Comfy Cloud tier and Pollinations/OpenAI keys on the server.'
                : message,
            retryable: clientRetryable,
            attempts: process.env.NODE_ENV === 'production'
                ? undefined
                : attempts.map((a) => ({
                    provider: a.provider,
                    status: a.status,
                    category: a.category,
                })),
        },
    };
}

module.exports = {
    USER_UNAVAILABLE_MESSAGE,
    FAILURE_CODE,
    resolveExplicitImageProvider,
    listConfiguredImageProviders,
    isProviderConfigured,
    isRetryableProviderFailure,
    classifyProviderFailure,
    attemptsAreProviderExhausted,
    generateImageWithFallback,
    safeImageUrl,
    resolveImageProvider,
};
