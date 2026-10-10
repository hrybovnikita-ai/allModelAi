const { parseImageInput } = require('./geminiVideoService');

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

function normalizeAspect(aspectRatio) {
    const value = String(aspectRatio || '16:9').trim();
    if (['16:9', '9:16', '1:1'].includes(value)) return value;
    return '16:9';
}

function normalizeResolution(resolution) {
    const value = String(resolution || '720p').trim().toLowerCase();
    if (['360p', '480p', '720p', '1080p', '4k'].includes(value)) return value;
    return '720p';
}

function normalizeDuration(durationSeconds, fallback = 5) {
    const value = Number(durationSeconds);
    if (!Number.isFinite(value)) return fallback;
    return Math.min(60, Math.max(1, Math.round(value)));
}

function validateVideoBody(body = {}) {
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    if (!prompt || prompt.length > 4000) {
        return { error: 'Describe your video using 1 to 4000 characters.' };
    }
    const aspectRatio = normalizeAspect(body.aspectRatio);
    const resolution = normalizeResolution(body.resolution);
    const durationSeconds = normalizeDuration(body.durationSeconds);
    const image = parseImageInput(body);
    if (image?.imageBytes) {
        const bytes = Buffer.from(image.imageBytes.replace(/\s/g, ''), 'base64').length;
        if (bytes > MAX_IMAGE_BYTES) {
            return { error: 'Reference image is too large. Use an image under 8 MB.' };
        }
    }
    return {
        value: {
            prompt,
            aspectRatio,
            resolution,
            durationSeconds,
            negativePrompt: typeof body.negativePrompt === 'string' ? body.negativePrompt.trim() : '',
            image,
            wait: body.wait !== false,
            model: typeof body.model === 'string' ? body.model.trim() : '',
            provider: typeof body.provider === 'string' ? body.provider.trim().toLowerCase() : '',
        },
    };
}

module.exports = {
    validateVideoBody,
    normalizeAspect,
    normalizeResolution,
    MAX_IMAGE_BYTES,
};
