const {
    GeminiVideoError,
    generateGeminiVideo,
    getGeminiVideoStatus,
    isGeminiVideoConfigured,
    parseImageInput,
} = require('./services/geminiVideoService');

const USER_UNAVAILABLE = 'Video generation is temporarily unavailable. Please try again in a moment.';

const validateVideoBody = (body = {}) => {
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    if (!prompt || prompt.length > 4000) {
        return { error: 'Describe your video using 1 to 4000 characters.' };
    }
    const aspectRatio = body.aspectRatio != null && body.aspectRatio !== ''
        ? String(body.aspectRatio).trim()
        : '16:9';
    if (!['16:9', '9:16'].includes(aspectRatio)) {
        return { error: 'Aspect ratio must be 16:9 (landscape) or 9:16 (portrait).' };
    }
    const resolution = body.resolution != null && body.resolution !== ''
        ? String(body.resolution).trim().toLowerCase()
        : '720p';
    if (!['720p', '1080p'].includes(resolution)) {
        return { error: 'Resolution must be 720p or 1080p.' };
    }
    return {
        value: {
            prompt,
            aspectRatio,
            resolution,
            negativePrompt: typeof body.negativePrompt === 'string' ? body.negativePrompt.trim() : '',
            durationSeconds: body.durationSeconds != null ? Number(body.durationSeconds) : undefined,
            image: parseImageInput(body),
        },
    };
};

const generateVideo = async (req, res) => {
    if (!isGeminiVideoConfigured()) {
        return res.status(503).json({
            success: false,
            code: 'GEMINI_NOT_CONFIGURED',
            message: 'Video generation is not configured. Add GEMINI_API_KEY to the server environment.',
            missingEnvVars: ['GEMINI_API_KEY'],
        });
    }

    const validation = validateVideoBody(req.body || {});
    if (validation.error) {
        return res.status(400).json({ message: validation.error });
    }

    try {
        const result = await generateGeminiVideo({
            ...validation.value,
        });
        return res.status(200).json(result);
    } catch (error) {
        if (error instanceof GeminiVideoError) {
            const clientStatus = error.status === 499 ? 499 : Math.min(error.status, 599);
            return res.status(clientStatus).json({
                success: false,
                code: error.code,
                message: error.code === 'GEMINI_VIDEO_FAILED' ? USER_UNAVAILABLE : error.message,
                retryable: error.retryable,
            });
        }
        console.log('[VIDEO] Unexpected error:', error.name);
        return res.status(503).json({
            success: false,
            code: 'VIDEO_GENERATION_UNAVAILABLE',
            message: USER_UNAVAILABLE,
        });
    }
};

const getVideoGenerationStatus = (_req, res) => {
    return res.status(200).json(getGeminiVideoStatus());
};

module.exports = {
    generateVideo,
    getVideoGenerationStatus,
};
