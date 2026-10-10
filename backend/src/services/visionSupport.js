const { getCapabilities } = require('./smartRouter2/capabilities');
const {
    isRoutedModelAvailable,
    providerAvailabilityForRouter,
} = require('../providerHealth');
const { routedModelHasApiKey } = require('../chatProviderRuntime');

const SUPPORTED_IMAGE_MIMES = new Set([
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/webp',
    'image/gif',
]);

/** Decoded binary size limits (per attachment / total in one request). */
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_TOTAL_IMAGE_BYTES = 20 * 1024 * 1024;

const VISION_ROUTE_ORDER = ['gemini', 'gpt', 'claude'];

function isVisionCapableSlug(slug) {
    return Boolean(getCapabilities(slug)?.vision);
}

function parseDataUrlMeta(raw) {
    if (!raw || typeof raw !== 'string') return null;
    const match = raw.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
    if (!match) return null;
    const mimeType = match[1].toLowerCase();
    const base64Data = match[2];
    let decodedBytes = 0;
    try {
        decodedBytes = Buffer.from(base64Data, 'base64').length;
    } catch {
        return { mimeType, invalid: true };
    }
    return { mimeType, base64Data, decodedBytes };
}

/**
 * @param {Array<{ image?: string, imageUrl?: string }>} messages
 * @returns {{ ok: true } | { ok: false, code: string, message: string }}
 */
function validateMessageImages(messages) {
    let totalBytes = 0;
    for (const message of messages || []) {
        const raw = message?.image || message?.imageUrl;
        if (!raw) continue;
        if (typeof raw === 'string' && (raw.startsWith('http://') || raw.startsWith('https://'))) {
            continue;
        }
        const meta = parseDataUrlMeta(raw);
        if (!meta) {
            return {
                ok: false,
                code: 'VISION_INVALID_IMAGE',
                message: 'Invalid image attachment. Use PNG, JPEG, or WebP (under 12 MB each).',
            };
        }
        if (meta.invalid) {
            return {
                ok: false,
                code: 'VISION_INVALID_IMAGE',
                message: 'Could not decode the uploaded image. Try another file.',
            };
        }
        if (!SUPPORTED_IMAGE_MIMES.has(meta.mimeType)) {
            return {
                ok: false,
                code: 'VISION_UNSUPPORTED_FORMAT',
                message: `Unsupported image type (${meta.mimeType}). Use PNG, JPEG, WebP, or GIF.`,
            };
        }
        if (meta.decodedBytes > MAX_IMAGE_BYTES) {
            return {
                ok: false,
                code: 'VISION_IMAGE_TOO_LARGE',
                message: 'Image is too large (max 12 MB per image). Try a smaller screenshot.',
            };
        }
        totalBytes += meta.decodedBytes;
    }
    if (totalBytes > MAX_TOTAL_IMAGE_BYTES) {
        return {
            ok: false,
            code: 'VISION_IMAGE_TOO_LARGE',
            message: 'Total image size in this chat request is too large. Send fewer or smaller images.',
        };
    }
    return { ok: true };
}

function visionSlugAllowed(slug, modelAllowed) {
    const availability = providerAvailabilityForRouter();
    return modelAllowed(slug)
        && isVisionCapableSlug(slug)
        && isRoutedModelAvailable(slug, availability)
        && routedModelHasApiKey(slug);
}

/**
 * Pick a configured vision-capable routed slug (never cloudflare / llama text-only).
 * @param {string} preferred
 * @param {(slug: string) => boolean} modelAllowed
 * @returns {string | null}
 */
function findVisionRoutedModel(preferred, modelAllowed) {
    const order = [];
    if (preferred && VISION_ROUTE_ORDER.includes(preferred)) order.push(preferred);
    for (const slug of VISION_ROUTE_ORDER) {
        if (!order.includes(slug)) order.push(slug);
    }
    for (const slug of order) {
        if (visionSlugAllowed(slug, modelAllowed)) return slug;
    }
    return null;
}

function resolveGeminiVisionModel(hasImages) {
    if (!hasImages) {
        return process.env.GEMINI_MODEL || 'gemini-flash-lite-latest';
    }
    const visionOverride = String(process.env.GEMINI_VISION_MODEL || '').trim();
    if (visionOverride) return visionOverride;
    const configured = String(process.env.GEMINI_MODEL || '').trim();
    if (configured && !/flash-lite|lite-latest|text-only/i.test(configured)) {
        return configured;
    }
    return 'gemini-2.5-flash';
}

function resolveOpenAiVisionModel() {
    const visionOverride = String(process.env.OPENAI_VISION_MODEL || '').trim();
    if (visionOverride) return visionOverride;
    const configured = String(process.env.OPENAI_MODEL || process.env.OPEN_AI_MODEL || '').trim();
    if (configured && /gpt-4o|gpt-4-turbo|gpt-4-vision|o4-mini|chatgpt-4o/i.test(configured)) {
        return configured;
    }
    return 'gpt-4o-mini';
}

function mapUpstreamStatusForClient(upstreamStatus) {
    const status = Number(upstreamStatus) || 502;
    if (status === 401 || status === 403) return 502;
    if (status === 429) return 429;
    if (status === 408 || status === 504) return 504;
    if (status === 413) return 413;
    if (status >= 500) return 502;
    if (status >= 400) return status;
    return 502;
}

module.exports = {
    SUPPORTED_IMAGE_MIMES,
    MAX_IMAGE_BYTES,
    MAX_TOTAL_IMAGE_BYTES,
    VISION_ROUTE_ORDER,
    isVisionCapableSlug,
    visionSlugAllowed,
    validateMessageImages,
    findVisionRoutedModel,
    resolveGeminiVisionModel,
    resolveOpenAiVisionModel,
    mapUpstreamStatusForClient,
};
