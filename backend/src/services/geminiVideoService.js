/**
 * Google AI Studio / Gemini API — Veo video generation (async operations + polling).
 * @typedef {Object} GeminiVideoRequest
 * @property {string} prompt
 * @property {string} [aspectRatio] '16:9' | '9:16'
 * @property {string} [resolution] '720p' | '1080p'
 * @property {number} [durationSeconds]
 * @property {string} [negativePrompt]
 * @property {{ imageBytes: string, mimeType: string }} [image]
 * @property {AbortSignal} [signal]
 *
 * @typedef {Object} GeminiVideoResult
 * @property {boolean} success
 * @property {string} videoUrl data:video/mp4;base64,... or https URI
 * @property {string} mimeType
 * @property {string} model
 * @property {string} provider
 * @property {string} [operationName]
 * @property {number} [bytes]
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');
const { redactSecrets } = require('../imageProviderAdapter');

const DEFAULT_MODEL = 'veo-3.1-fast-generate-preview';
const PROVIDER_ID = 'google-veo';

class GeminiVideoError extends Error {
    /**
     * @param {string} message
     * @param {{ status?: number, code?: string, retryable?: boolean }} [options]
     */
    constructor(message, options = {}) {
        super(message);
        this.name = 'GeminiVideoError';
        this.status = options.status || 502;
        this.code = options.code || 'GEMINI_VIDEO_ERROR';
        this.retryable = Boolean(options.retryable);
    }
}

const strip = (value) => String(value || '').trim().replace(/^["']|["']$/g, '');

function getGeminiApiKey() {
    return strip(process.env.GEMINI_API_KEY);
}

function isGeminiVideoConfigured() {
    return Boolean(getGeminiApiKey());
}

function getVideoModel() {
    return strip(process.env.GEMINI_VIDEO_MODEL) || DEFAULT_MODEL;
}

function pollIntervalMs() {
    const value = Number(process.env.GEMINI_VIDEO_POLL_MS);
    return Number.isFinite(value) && value >= 2000 ? value : 10000;
}

function pollTimeoutMs() {
    const value = Number(process.env.GEMINI_VIDEO_TIMEOUT_MS);
    return Number.isFinite(value) && value >= 30000 ? value : 600000;
}

/** @returns {GoogleGenAI} */
function createGenAiClient() {
    const apiKey = getGeminiApiKey();
    if (!apiKey) {
        throw new GeminiVideoError('GEMINI_API_KEY is not configured on the server.', {
            status: 503,
            code: 'GEMINI_NOT_CONFIGURED',
            retryable: false,
        });
    }
    return new GoogleGenAI({ apiKey });
}

/**
 * @param {string} [aspectRatio]
 * @returns {'16:9' | '9:16'}
 */
function normalizeAspect(aspectRatio) {
    const value = String(aspectRatio || '16:9').trim();
    return value === '9:16' ? '9:16' : '16:9';
}

/**
 * @param {string} [resolution]
 * @returns {'720p' | '1080p'}
 */
function normalizeResolution(resolution) {
    const value = String(resolution || '720p').trim().toLowerCase();
    return value === '1080p' ? '1080p' : '720p';
}

/**
 * Parse optional image input from API body (data URL or raw base64).
 * @param {{ imageUrl?: string, imageBase64?: string, imageMimeType?: string }} body
 */
function parseImageInput(body = {}) {
    const url = strip(body.imageUrl);
    if (url) {
        const match = /^data:(image\/[a-z0-9.+-]+);base64,([\s\S]+)$/i.exec(url);
        if (match) {
            return { imageBytes: match[2].replace(/\s/g, ''), mimeType: match[1].toLowerCase() };
        }
    }
    const raw = strip(body.imageBase64);
    if (raw) {
        const mimeType = strip(body.imageMimeType) || 'image/png';
        return { imageBytes: raw.replace(/\s/g, ''), mimeType };
    }
    return null;
}

function mapSdkError(error) {
    const message = redactSecrets(error?.message || String(error));
    const status = Number(error?.status || error?.statusCode) || 502;
    const retryable = [408, 429, 500, 502, 503, 504].includes(status)
        || /rate limit|quota|resource exhausted|timeout|unavailable/i.test(message);
    if (status === 401 || status === 403 || /api key|permission|invalid.*key/i.test(message)) {
        return new GeminiVideoError('Video generation authentication failed. Check GEMINI_API_KEY on the server.', {
            status: 503,
            code: 'GEMINI_AUTH',
            retryable: false,
        });
    }
    if (status === 429 || /rate limit|quota|resource exhausted/i.test(message)) {
        return new GeminiVideoError('Video generation rate limit reached. Please try again later.', {
            status: 429,
            code: 'GEMINI_RATE_LIMIT',
            retryable: true,
        });
    }
    return new GeminiVideoError(message || 'Video generation failed.', {
        status: status >= 400 && status < 600 ? status : 502,
        code: 'GEMINI_VIDEO_FAILED',
        retryable,
    });
}

/**
 * @param {import('@google/genai').GoogleGenAI} ai
 * @param {import('@google/genai').Video} video
 */
async function resolveVideoPayload(ai, video) {
    if (!video) {
        throw new GeminiVideoError('No video returned from Gemini.', { status: 502, retryable: true });
    }
    if (video.videoBytes) {
        const mimeType = video.mimeType || 'video/mp4';
        const clean = String(video.videoBytes).replace(/\s/g, '');
        return {
            videoUrl: `data:${mimeType};base64,${clean}`,
            mimeType,
            bytes: Buffer.from(clean, 'base64').length,
        };
    }
    if (video.uri) {
        const apiKey = getGeminiApiKey();
        const response = await fetch(video.uri, {
            headers: apiKey ? { 'x-goog-api-key': apiKey } : {},
            signal: AbortSignal.timeout(120000),
        });
        if (!response.ok) {
            throw new GeminiVideoError(`Could not download generated video (HTTP ${response.status}).`, {
                status: 502,
                retryable: response.status >= 500,
            });
        }
        const buffer = Buffer.from(await response.arrayBuffer());
        const mimeType = (response.headers.get('content-type') || 'video/mp4').split(';')[0];
        return {
            videoUrl: `data:${mimeType};base64,${buffer.toString('base64')}`,
            mimeType,
            bytes: buffer.length,
            remoteUri: video.uri,
        };
    }
    const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'amai-veo-'));
    const tempFile = path.join(tempDir, 'output.mp4');
    try {
        await ai.files.download({ file: video, downloadPath: tempFile });
        const buffer = await fs.promises.readFile(tempFile);
        const mimeType = 'video/mp4';
        return {
            videoUrl: `data:${mimeType};base64,${buffer.toString('base64')}`,
            mimeType,
            bytes: buffer.length,
        };
    } finally {
        await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
}

/**
 * @param {GeminiVideoRequest} request
 * @returns {Promise<GeminiVideoResult>}
 */
async function generateGeminiVideo(request) {
    const prompt = strip(request.prompt);
    if (!prompt || prompt.length > 4000) {
        throw new GeminiVideoError('Describe your video using 1 to 4000 characters.', {
            status: 400,
            code: 'INVALID_PROMPT',
            retryable: false,
        });
    }

    const ai = createGenAiClient();
    const model = getVideoModel();
    const aspectRatio = normalizeAspect(request.aspectRatio);
    const resolution = normalizeResolution(request.resolution);

    /** @type {import('@google/genai').GenerateVideosParameters} */
    const params = {
        model,
        prompt,
        config: {
            aspectRatio,
            resolution,
            ...(request.durationSeconds ? { durationSeconds: request.durationSeconds } : {}),
            ...(request.negativePrompt ? { negativePrompt: request.negativePrompt } : {}),
        },
    };

    if (request.image?.imageBytes) {
        params.image = {
            imageBytes: request.image.imageBytes,
            mimeType: request.image.mimeType || 'image/png',
        };
    }

    let operation;
    try {
        operation = await ai.models.generateVideos(params);
    } catch (error) {
        throw mapSdkError(error);
    }

    const started = Date.now();
    const timeoutMs = pollTimeoutMs();
    const signal = request.signal;

    while (!operation.done) {
        if (signal?.aborted) {
            throw new GeminiVideoError('Video generation was cancelled.', {
                status: 499,
                code: 'CANCELLED',
                retryable: false,
            });
        }
        if (Date.now() - started > timeoutMs) {
            throw new GeminiVideoError('Video generation timed out. Try again with a shorter prompt.', {
                status: 504,
                code: 'GEMINI_VIDEO_TIMEOUT',
                retryable: true,
            });
        }
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs()));
        try {
            operation = await ai.operations.getVideosOperation({ operation });
        } catch (error) {
            throw mapSdkError(error);
        }
    }

    if (operation.error) {
        const detail = redactSecrets(JSON.stringify(operation.error));
        throw new GeminiVideoError(detail || 'Video generation failed.', {
            status: 502,
            code: 'GEMINI_VIDEO_FAILED',
            retryable: false,
        });
    }

    const generated = operation.response?.generatedVideos?.[0]?.video;
    const payload = await resolveVideoPayload(ai, generated);

    const maxBytes = Number(process.env.GEMINI_VIDEO_MAX_INLINE_BYTES) || 25 * 1024 * 1024;
    if (payload.bytes > maxBytes) {
        throw new GeminiVideoError('Generated video is too large to embed in chat. Contact support to enable streaming delivery.', {
            status: 413,
            code: 'VIDEO_TOO_LARGE',
            retryable: false,
        });
    }

    return {
        success: true,
        videoUrl: payload.videoUrl,
        mimeType: payload.mimeType,
        model,
        provider: PROVIDER_ID,
        operationName: operation.name,
        bytes: payload.bytes,
        aspectRatio,
        resolution,
        prompt,
    };
}

function getGeminiVideoStatus() {
    return {
        configured: isGeminiVideoConfigured(),
        provider: PROVIDER_ID,
        model: getVideoModel(),
        aspects: ['16:9', '9:16'],
        resolutions: ['720p', '1080p'],
        pollIntervalMs: pollIntervalMs(),
        timeoutMs: pollTimeoutMs(),
    };
}

module.exports = {
    GeminiVideoError,
    generateGeminiVideo,
    getGeminiVideoStatus,
    getGeminiApiKey,
    getVideoModel,
    isGeminiVideoConfigured,
    parseImageInput,
};
