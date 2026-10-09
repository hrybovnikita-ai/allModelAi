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
    redactSecrets,
    sniffImageMime,
} = require('../imageProviderAdapter');

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

const getCloudflareCredentials = () => ({
    account: strip(process.env.CLOUDFLARE_ACCOUNT_ID),
    key: strip(process.env.CLOUDFLARE_API_KEY || process.env.CLAUDEFLARE_API_KEY || process.env.API_IMAGE_KEY),
});

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
    if (id === 'cloudflare') {
        const { account, key } = getCloudflareCredentials();
        return Boolean(account && key);
    }
    return false;
};

const listConfiguredImageProviders = () => {
    let explicit = normalizeImageProviderId(process.env.IMAGE_PROVIDER);
    const ordered = [];
    const pushUnique = (name) => {
        const id = normalizeImageProviderId(name);
        if (!id || ordered.includes(id)) return;
        if (isProviderConfigured(id)) ordered.push(id);
    };

    if (explicit && IMAGE_PROVIDER_IDS.includes(explicit)) {
        pushUnique(explicit);
        IMAGE_PROVIDER_IDS.forEach((name) => {
            if (name !== explicit) pushUnique(name);
        });
        return ordered;
    }

    IMAGE_PROVIDER_IDS.forEach((name) => pushUnique(name));
    return ordered;
};

const isRetryableProviderFailure = ({ status, code, message }) => {
    if ([402, 408, 409, 429, 500, 502, 503, 504].includes(Number(status))) return true;
    if (Number(status) === 401) return true;
    const blob = String(message || code || '').toLowerCase();
    if (/insufficient|balance|quota|pollen|rate limit|timeout|unavailable|temporarily|exhausted/.test(blob)) {
        return true;
    }
    return false;
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

const normalizeSuccessPayload = ({
    imageUrl,
    provider,
    model,
    size,
    mimeType,
    promptPayload,
    plan,
}) => {
    const { width, height } = parseSizeDimensions(size || plan.size);
    return {
        success: true,
        imageUrl,
        provider,
        model,
        width,
        height,
        prompt: promptPayload.userPrompt,
        style: promptPayload.style,
        aspectRatio: plan.aspectRatio,
        quality: plan.quality,
        size: plan.size,
        mimeType,
        upscaleSupported: plan.upscaleSupported,
    };
};

async function generateWithProvider(provider, {
    generationPrompt,
    quality,
    aspectRatio,
    requestedModel,
}) {
    const plan = buildImageGenerationPlan({
        provider,
        quality,
        aspectRatio,
        requestedModel,
    });
    if (plan.error) {
        return { ok: false, retryable: false, status: 400, internalMessage: plan.error, provider };
    }

    const { account, key: cloudflareKey } = getCloudflareCredentials();
    const openAiKey = getOpenAiImageKey();

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
            return {
                ok: true,
                imageUrl: result.imageUrl,
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
        const image = data?.data?.[0];
        const base64 = image?.b64_json;
        const mimeType = base64 ? sniffImageMime(base64) : mimeFromImageUrl(image?.url);
        const imageUrl = base64 ? `data:${mimeType};base64,${base64}` : image?.url;
        if (!safeImageUrl(imageUrl)) {
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
            imageUrl,
            mimeType,
            plan: { ...plan, model: pollinationsModel || plan.model },
            provider: 'pollinations',
        };
    }

    const cloudflare = provider === 'cloudflare';
    const upstreamUrl = cloudflare
        ? `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/ai/run/${encodeURIComponent(plan.model)}`
        : process.env.IMAGE_API_URL || 'https://api.openai.com/v1/images/generations';
    const upstreamBody = cloudflare
        ? { prompt: generationPrompt.slice(0, plan.maxPromptLength), steps: plan.request.steps }
        : { ...plan.request, prompt: generationPrompt.slice(0, plan.maxPromptLength) };

    const response = await fetch(upstreamUrl, {
        method: 'POST',
        signal: AbortSignal.timeout(180000),
        headers: {
            Authorization: `Bearer ${cloudflare ? cloudflareKey : openAiKey}`,
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

    const image = data?.data?.[0];
    const base64 = cloudflare ? data?.result?.image : image?.b64_json;
    const mimeType = base64
        ? sniffImageMime(base64, cloudflare ? 'image/jpeg' : 'image/png')
        : mimeFromImageUrl(image?.url);
    const imageUrl = base64 ? `data:${mimeType};base64,${base64}` : image?.url;
    if (!safeImageUrl(imageUrl)) {
        return {
            ok: false,
            retryable: true,
            status: 502,
            internalMessage: `${provider} returned no image payload`,
            provider,
        };
    }

    return { ok: true, imageUrl, mimeType, plan, provider };
}

async function generateImageWithFallback({
    generationPrompt,
    promptPayload,
    quality,
    aspectRatio,
    requestedModel,
}) {
    const providers = listConfiguredImageProviders();
    if (!providers.length) {
        logImage('No image providers configured');
        return {
            ok: false,
            clientStatus: 503,
            body: {
                success: false,
                code: FAILURE_CODE,
                message: USER_UNAVAILABLE_MESSAGE,
            },
        };
    }

    logImage('Generation started', { providers: providers.join(' → ') });
    const attempts = [];

    for (let index = 0; index < providers.length; index += 1) {
        const provider = providers[index];
        logImage(`Trying provider: ${provider}`);
        try {
            const result = await generateWithProvider(provider, {
                generationPrompt,
                quality,
                aspectRatio,
                requestedModel: index === 0 ? requestedModel : '',
            });

            if (result.ok) {
                logImage('Generation completed', { providerUsed: provider });
                return {
                    ok: true,
                    clientStatus: 200,
                    body: normalizeSuccessPayload({
                        imageUrl: result.imageUrl,
                        provider: result.provider,
                        model: result.plan.model,
                        size: result.plan.size,
                        mimeType: result.mimeType,
                        promptPayload,
                        plan: result.plan,
                    }),
                };
            }

            attempts.push({
                provider,
                status: result.status,
                retryable: result.retryable,
                message: result.internalMessage,
            });
            logImage(`${provider} failed: ${result.status || 'error'}`, {
                retryable: result.retryable,
                detail: process.env.NODE_ENV === 'production' ? undefined : redactSecrets(result.internalMessage),
            });

            if (result.status === 400) {
                return {
                    ok: false,
                    clientStatus: 400,
                    body: { message: result.internalMessage || 'Invalid image generation request.' },
                };
            }
            if (!shouldAdvanceToNextProvider(result, index, providers.length)) {
                break;
            }
            logImage('Trying fallback provider');
        } catch (error) {
            const retryable = error.name === 'TimeoutError' || error.name === 'AbortError';
            attempts.push({
                provider,
                status: error.name === 'TimeoutError' ? 504 : 502,
                retryable,
                message: redactSecrets(error.message),
            });
            logImage(`${provider} failed: ${error.name}`, {
                detail: process.env.NODE_ENV === 'production' ? undefined : redactSecrets(error.message),
            });
            if (!shouldAdvanceToNextProvider({ ok: false, status: error.name === 'TimeoutError' ? 504 : 502 }, index, providers.length)) {
                break;
            }
            logImage('Trying fallback provider');
        }
    }

    if (process.env.NODE_ENV !== 'production') {
        console.log(`${LOG_PREFIX} All providers failed`, attempts.map((a) => ({
            provider: a.provider,
            status: a.status,
            message: a.message,
        })));
    }

    const hadTimeout = attempts.some((a) => a.status === 504);
    const authFailure = attempts.find((a) => a.status === 403 || a.status === 401);
    let message = USER_UNAVAILABLE_MESSAGE;
    if (hadTimeout) {
        message = 'Image generation timed out. Try again with Standard quality or a shorter prompt.';
    } else if (authFailure && attempts.length === 1) {
        message = 'The primary image provider rejected the server API key. Check Comfy Cloud billing/tier or configure a fallback provider (Pollinations / OpenAI).';
    }
    const allAuthBlocked = attempts.length > 0 && attempts.every((a) => a.status === 401 || a.status === 403);
    return {
        ok: false,
        clientStatus: hadTimeout ? 504 : (authFailure?.status === 500 ? 500 : 502),
        body: {
            success: false,
            code: authFailure?.status === 500 ? 'COMFY_CLOUD_NOT_CONFIGURED' : FAILURE_CODE,
            message: allAuthBlocked && attempts.length > 1
                ? 'Image providers rejected the server API keys. Check Comfy Cloud tier and Pollinations/OpenAI keys on the server.'
                : message,
            retryable: true,
            attempts: process.env.NODE_ENV === 'production'
                ? undefined
                : attempts.map((a) => ({ provider: a.provider, status: a.status })),
        },
    };
}

module.exports = {
    USER_UNAVAILABLE_MESSAGE,
    FAILURE_CODE,
    listConfiguredImageProviders,
    isProviderConfigured,
    isRetryableProviderFailure,
    generateImageWithFallback,
    safeImageUrl,
    resolveImageProvider,
};
