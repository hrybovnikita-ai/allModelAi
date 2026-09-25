const QUALITY_IDS = ['standard', 'hd', 'ultra'];
const ASPECT_IDS = ['1:1', '16:9', '9:16'];
const STYLE_IDS = ['auto', 'photorealistic', 'cinematic', 'anime', 'digital-art', '3d'];

const FLUX_SIZES = {
    '1:1': '1024x1024',
    '16:9': '1536x1024',
    '9:16': '1024x1536',
};

const GPT_IMAGE_SIZES = {
    '1:1': '1024x1024',
    '16:9': '1536x1024',
    '9:16': '1024x1536',
};

const DALLE3_SIZES = {
    '1:1': '1024x1024',
    '16:9': '1792x1024',
    '9:16': '1024x1792',
};

const POLLINATIONS_MODELS = [
    'flux',
    'gptimage',
    'gptimage-large',
    'gpt-image',
    'gpt-image-1-mini',
    'gpt-image-1.5',
    'gpt-image-large',
    'gpt-image-2',
    'zimage',
    'flux-2-pro',
    'flux-2-flex',
    'klein',
    'seedream',
    'seedream-pro',
    'seedream5',
    'seedream5-pro',
    'nanobanana',
    'nanobanana-2',
    'nanobanana-pro',
    'kontext',
];

const OPENAI_MODELS = ['gpt-image-1', 'gpt-image-1.5', 'gpt-image-2', 'dall-e-3', 'dall-e-2'];

const CLOUDFLARE_MODELS = ['@cf/black-forest-labs/flux-1-schnell'];

const strip = (value) => String(value || '').trim().replace(/^["']|["']$/g, '');

const redactSecrets = (value) => String(value || '')
    .replace(/sk_[A-Za-z0-9]+/g, '[redacted]')
    .replace(/sk-[A-Za-z0-9_-]+/g, '[redacted]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]');

const parseQuality = (value, { strict = false } = {}) => {
    if (value == null || value === '') return 'standard';
    const key = String(value).trim().toLowerCase();
    if (key === 'high') return 'hd';
    if (QUALITY_IDS.includes(key)) return key;
    return strict ? null : 'standard';
};

const parseAspect = (value, { strict = false } = {}) => {
    if (value == null || value === '') return '1:1';
    const key = String(value).trim();
    if (ASPECT_IDS.includes(key)) return key;
    return strict ? null : '1:1';
};

const parseStyle = (value, { strict = false } = {}) => {
    if (value == null || value === '') return 'auto';
    const key = String(value).trim().toLowerCase();
    if (STYLE_IDS.includes(key)) return key;
    return strict ? null : 'auto';
};

const pollinationsSupportsQuality = (model) => /gptimage|gpt-image|grok-imagine-image-2/i.test(String(model || ''));

const usesGptImageSizes = (model) => /gptimage|gpt-image|seedream|flux-2|flux\.2|nanobanana|qwen-image|grok-imagine/i.test(String(model || ''));

const pollinationsQualityParam = (quality) => {
    if (quality === 'standard') return 'medium';
    if (quality === 'hd') return 'high';
    return 'hd';
};

const isFluxFamilyModel = (model) => /^(flux|zimage|klein)(?:[-.]|$)/i.test(String(model || '').trim());

const supportsResolutionPricing = (model) => /seedream|nanobanana/i.test(String(model || ''));

const FLUX_NEGATIVE_PROMPT = 'worst quality, blurry, low resolution, jpeg artifacts, distorted, watermark, text overlay';

const configuredPollinationsModel = (quality) => {
    const pinned = strip(process.env.POLLINATIONS_IMAGE_MODEL);
    const hdModel = strip(process.env.POLLINATIONS_HD_MODEL);
    const ultraModel = strip(process.env.POLLINATIONS_ULTRA_MODEL);
    if (quality === 'ultra') {
        if (ultraModel) return ultraModel;
        if (pinned && pinned !== 'flux') return pinned;
        return 'gpt-image-2';
    }
    if (quality === 'hd') {
        if (hdModel) return hdModel;
        if (pinned && pinned !== 'flux') return pinned;
        return 'gptimage';
    }
    return pinned || 'flux';
};

const allowedPollinationsModels = () => new Set([
    ...POLLINATIONS_MODELS,
    strip(process.env.POLLINATIONS_IMAGE_MODEL),
    strip(process.env.POLLINATIONS_HD_MODEL),
    strip(process.env.POLLINATIONS_ULTRA_MODEL),
].filter(Boolean));

const allowedOpenAiModels = () => new Set([
    ...OPENAI_MODELS,
    strip(process.env.IMAGE_MODEL),
].filter(Boolean));

const allowedCloudflareModels = () => new Set([
    ...CLOUDFLARE_MODELS,
    strip(process.env.CLOUDFLARE_IMAGE_MODEL),
].filter(Boolean));

const openAiKind = (model) => {
    const name = String(model || '');
    if (/dall-e-2/i.test(name)) return 'dalle2';
    if (/dall-e-3/i.test(name)) return 'dalle3';
    if (/gpt-image/i.test(name)) return 'gpt-image';
    return 'compatible';
};

const sizeFor = (provider, model, aspect, quality) => {
    if (provider === 'pollinations') {
        return usesGptImageSizes(model) ? GPT_IMAGE_SIZES[aspect] : FLUX_SIZES[aspect];
    }
    if (provider === 'openai') {
        const kind = openAiKind(model);
        if (kind === 'dalle2') return '1024x1024';
        if (kind === 'dalle3') return DALLE3_SIZES[aspect];
        return GPT_IMAGE_SIZES[aspect];
    }
    if (provider === 'cloudflare') return null;
    return FLUX_SIZES[aspect];
};

const cloudflareSteps = (quality) => {
    if (quality === 'ultra') return 8;
    if (quality === 'hd') return 6;
    return 4;
};

const buildProviderRequest = ({ provider, model, quality, aspectRatio, size }) => {
    if (provider === 'pollinations') {
        const request = {
            model,
            size,
            n: 1,
            response_format: 'b64_json',
        };
        if (pollinationsSupportsQuality(model)) {
            request.quality = pollinationsQualityParam(quality);
        }
        if (isFluxFamilyModel(model)) {
            request.negative_prompt = FLUX_NEGATIVE_PROMPT;
        }
        if (supportsResolutionPricing(model)) {
            if (quality === 'ultra') request.resolution = '2k';
            else if (quality === 'hd') request.resolution = '1k';
        }
        return request;
    }

    if (provider === 'openai') {
        const kind = openAiKind(model);
        if (kind === 'gpt-image') {
            return {
                model,
                size,
                n: 1,
                quality: quality === 'standard' ? 'medium' : 'high',
                output_format: 'png',
            };
        }
        if (kind === 'dalle3') {
            return {
                model,
                size,
                n: 1,
                quality: quality === 'standard' ? 'standard' : 'hd',
                response_format: 'b64_json',
            };
        }
        if (kind === 'dalle2') {
            return {
                model,
                size: '1024x1024',
                n: 1,
                response_format: 'b64_json',
            };
        }
        return { model, size, n: 1 };
    }

    if (provider === 'cloudflare') {
        return { steps: cloudflareSteps(quality) };
    }

    return { model, size, n: 1 };
};

const sizesForQuality = (provider, quality) => {
    const model = provider === 'pollinations'
        ? configuredPollinationsModel(quality)
        : provider === 'openai'
            ? strip(process.env.IMAGE_MODEL || 'gpt-image-1')
            : strip(process.env.CLOUDFLARE_IMAGE_MODEL || CLOUDFLARE_MODELS[0]);
    return Object.fromEntries(ASPECT_IDS.map((aspect) => [aspect, sizeFor(provider, model, aspect, quality)]));
};

const buildImageGenerationPlan = ({ provider, quality, aspectRatio, requestedModel }) => {
    const normalizedQuality = parseQuality(quality);
    const normalizedAspect = parseAspect(aspectRatio);
    let model = requestedModel ? strip(requestedModel) : '';

    if (provider === 'pollinations') {
        if (model && !allowedPollinationsModels().has(model)) {
            return { error: 'Unsupported image model for the active provider.' };
        }
        model = model || configuredPollinationsModel(normalizedQuality);
    } else if (provider === 'openai') {
        const fallback = strip(process.env.IMAGE_MODEL || 'gpt-image-1');
        if (model && !allowedOpenAiModels().has(model)) {
            return { error: 'Unsupported image model for the active provider.' };
        }
        model = model || fallback;
    } else if (provider === 'cloudflare') {
        const fallback = strip(process.env.CLOUDFLARE_IMAGE_MODEL || CLOUDFLARE_MODELS[0]);
        if (model && !allowedCloudflareModels().has(model)) {
            return { error: 'Unsupported image model for the active provider.' };
        }
        model = model || fallback;
    } else {
        return { error: 'Image generation is not configured.' };
    }

    const size = sizeFor(provider, model, normalizedAspect, normalizedQuality);
    const request = buildProviderRequest({
        provider,
        model,
        quality: normalizedQuality,
        aspectRatio: normalizedAspect,
        size,
    });

    return {
        provider,
        quality: normalizedQuality,
        aspectRatio: normalizedAspect,
        model,
        size,
        request,
        upscaleSupported: upscaleSupported(),
        maxPromptLength: provider === 'cloudflare' ? 2048 : 4000,
    };
};

const upscaleSupported = () => Boolean(strip(process.env.UPSCALE_API_URL) && strip(process.env.UPSCALE_API_KEY));

const sniffImageMime = (base64, fallback = 'image/png') => {
    let buffer;
    try {
        buffer = Buffer.from(String(base64 || '').slice(0, 64), 'base64');
    } catch {
        return fallback;
    }
    if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
        return 'image/png';
    }
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
        return 'image/jpeg';
    }
    if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
        return 'image/webp';
    }
    return fallback;
};

const imageUrlFromPayload = (payload) => {
    if (!payload || typeof payload !== 'object') return null;
    if (typeof payload.imageUrl === 'string') return payload.imageUrl;
    const nested = payload.data?.[0];
    if (nested?.b64_json) {
        const mime = nested.media_type || sniffImageMime(nested.b64_json);
        return `data:${mime};base64,${nested.b64_json}`;
    }
    if (typeof nested?.url === 'string') return nested.url;
    const raw = payload.image || payload.result?.image;
    if (typeof raw === 'string' && raw.startsWith('data:image/')) return raw;
    if (typeof raw === 'string' && /^[A-Za-z0-9+/=\s]+$/.test(raw.slice(0, 80))) {
        const mime = sniffImageMime(raw);
        return `data:${mime};base64,${raw.replace(/\s/g, '')}`;
    }
    return null;
};

const upscaleWithExternalProvider = async (imageUrl) => {
    if (!upscaleSupported()) return { supported: false };
    const endpoint = strip(process.env.UPSCALE_API_URL);
    const response = await fetch(endpoint, {
        method: 'POST',
        signal: AbortSignal.timeout(180000),
        headers: {
            Authorization: `Bearer ${strip(process.env.UPSCALE_API_KEY)}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ image: imageUrl }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
        const message = redactSecrets(data?.error?.message || data?.message || `Upscaler HTTP ${response.status}`);
        return { supported: true, ok: false, status: response.status, message };
    }
    const nextUrl = imageUrlFromPayload(data);
    if (!nextUrl) {
        return { supported: true, ok: false, status: 502, message: 'The upscaler did not return an image.' };
    }
    return { supported: true, ok: true, imageUrl: nextUrl, mimeType: nextUrl.startsWith('data:') ? nextUrl.slice(5, nextUrl.indexOf(';')) : null };
};

const capabilitySummary = (provider) => {
    const qualities = QUALITY_IDS;
    const sizes = Object.fromEntries(qualities.map((quality) => [quality, sizesForQuality(provider, quality)]));
    const ultraLandscape = sizes.ultra?.['16:9'];
    const ultraPortrait = sizes.ultra?.['9:16'];
    const maxResolution = [sizes.ultra?.['1:1'], ultraLandscape, ultraPortrait].filter(Boolean).sort((a, b) => {
        const pixels = (value) => value.split('x').reduce((product, part) => product * Number(part), 1);
        return pixels(b) - pixels(a);
    })[0] || null;
    return {
        qualities,
        aspects: ASPECT_IDS,
        sizes,
        maxResolution,
        upscaleSupported: upscaleSupported(),
        qualityModels: provider === 'pollinations'
            ? {
                standard: configuredPollinationsModel('standard'),
                hd: configuredPollinationsModel('hd'),
                ultra: configuredPollinationsModel('ultra'),
            }
            : null,
    };
};

module.exports = {
    QUALITY_IDS,
    ASPECT_IDS,
    STYLE_IDS,
    FLUX_SIZES,
    GPT_IMAGE_SIZES,
    DALLE3_SIZES,
    parseQuality,
    parseAspect,
    parseStyle,
    redactSecrets,
    sniffImageMime,
    buildImageGenerationPlan,
    capabilitySummary,
    upscaleSupported,
    upscaleWithExternalProvider,
    pollinationsSupportsQuality,
    configuredPollinationsModel,
};
