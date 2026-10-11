const { parseImageInput } = require('./geminiVideoService');
const { MagicHourError } = require('./magicHourClient');

const strip = (value) => String(value || '').trim();

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

async function fetchImageAsBase64(url, { signal } = {}) {
    const response = await fetch(url, { signal: signal || AbortSignal.timeout(60000) });
    if (!response.ok) {
        throw new MagicHourError('Could not load the reference image for image-to-video.', {
            status: 400,
            code: 'VIDEO_IMAGE_FETCH_FAILED',
            retryable: false,
        });
    }
    const mimeType = (response.headers.get('content-type') || 'image/png').split(';')[0].trim().toLowerCase();
    if (!mimeType.startsWith('image/')) {
        throw new MagicHourError('Reference file must be an image (PNG, JPEG, or WebP).', {
            status: 400,
            code: 'VIDEO_IMAGE_INVALID',
            retryable: false,
        });
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_IMAGE_BYTES) {
        throw new MagicHourError('Reference image is too large. Use an image under 8 MB.', {
            status: 400,
            code: 'VIDEO_IMAGE_TOO_LARGE',
            retryable: false,
        });
    }
    return { imageBytes: buffer.toString('base64'), mimeType };
}

/**
 * Resolves image-to-video source from API body (data URL, base64, or fetchable http(s) URL).
 * Rejects browser blob: URLs — client must upload as data URL first.
 */
async function resolveVideoImageFromBody(body, { baseUrl, signal } = {}) {
    const direct = parseImageInput(body);
    if (direct?.imageBytes) return direct;

    const url = strip(body?.imageUrl);
    if (!url) return null;
    if (url.startsWith('blob:')) {
        throw new MagicHourError(
            'Browser blob URLs cannot be sent to the video provider. Re-select the image or use “Use last generated image” after it has loaded.',
            { status: 400, code: 'VIDEO_IMAGE_BLOB_UNSUPPORTED', retryable: false },
        );
    }

    let fetchUrl = url;
    if (url.startsWith('/')) {
        const origin = strip(baseUrl) || 'http://127.0.0.1:5050';
        fetchUrl = `${origin.replace(/\/$/, '')}${url}`;
    }
    if (!/^https?:\/\//i.test(fetchUrl)) {
        throw new MagicHourError('Reference image URL is not supported. Upload an image file or use a generated image from chat.', {
            status: 400,
            code: 'VIDEO_IMAGE_INVALID',
            retryable: false,
        });
    }
    return fetchImageAsBase64(fetchUrl, { signal });
}

module.exports = {
    resolveVideoImageFromBody,
    MAX_IMAGE_BYTES,
};
