const { validateVideoBody } = require('../services/videoValidation');
const {
    startVideoGeneration,
    refreshJobFromProvider,
    publicJobPayload,
    completedChatPayload,
    getCombinedVideoStatus,
    MagicHourError,
    GeminiVideoError,
} = require('../services/videoOrchestrator');
const { getJobForUser, readStoredVideo } = require('../services/videoJobStore');

const USER_UNAVAILABLE = 'Video generation is temporarily unavailable. Please try again in a moment.';

function mapVideoError(error) {
    if (error instanceof MagicHourError || error instanceof GeminiVideoError) {
        const clientStatus = error.status === 499 ? 499 : Math.min(error.status || 502, 599);
        const body = {
            success: false,
            code: error.code,
            message: error.message,
            retryable: error.retryable,
            retryAfterSeconds: error.retryAfterSeconds ?? undefined,
        };
        if (error instanceof MagicHourError) {
            if (error.providerRejected) body.providerRejected = true;
            if (error.keyConfigured) body.keyConfigured = true;
            if (error.providerHttpStatus != null) body.providerHttpStatus = error.providerHttpStatus;
            if (error.providerCode) body.providerCode = error.providerCode;
        }
        return { status: clientStatus, body };
    }
    return {
        status: 503,
        body: {
            success: false,
            code: 'VIDEO_GENERATION_UNAVAILABLE',
            message: USER_UNAVAILABLE,
        },
    };
}

const postVideoGenerate = async (req, res) => {
    const validation = validateVideoBody(req.body || {});
    if (validation.error) {
        return res.status(400).json({ message: validation.error });
    }
    const wait = validation.value.wait !== false;
    try {
        const job = await startVideoGeneration({
            connection: req.app.locals.db,
            email: req.user.email,
            params: validation.value,
            wait,
            signal: req.signal,
        });
        if (wait && job.status === 'completed') {
            return res.status(200).json(completedChatPayload(job, req));
        }
        if (!wait) {
            return res.status(202).json(publicJobPayload(job, req));
        }
        if (job.status === 'failed') {
            return res.status(502).json({
                success: false,
                code: job.errorCode || 'VIDEO_FAILED',
                message: job.errorMessage || USER_UNAVAILABLE,
            });
        }
        return res.status(200).json(publicJobPayload(job, req));
    } catch (error) {
        const correlationId = req?.correlationId || req?.headers?.['x-request-id'] || 'video';
        console.error('[VIDEO_GENERATE]', correlationId, error.code || error.name, error.message);
        const mapped = mapVideoError(error);
        return res.status(mapped.status).json({ ...mapped.body, correlationId });
    }
};

const getVideoJob = async (req, res) => {
    let job = await getJobForUser(req.app.locals.db, req.params.jobId, req.user.email);
    if (!job) {
        return res.status(404).json({ message: 'Video job not found.' });
    }
    try {
        job = await refreshJobFromProvider(req.app.locals.db, job, req.signal);
    } catch (error) {
        const mapped = mapVideoError(error);
        return res.status(mapped.status).json(mapped.body);
    }
    return res.json(publicJobPayload(job, req));
};

const streamVideoJob = async (req, res) => {
    const job = await getJobForUser(req.app.locals.db, req.params.jobId, req.user.email);
    if (!job || job.status !== 'completed') {
        return res.status(404).json({ message: 'Video is not available.' });
    }
    const buffer = readStoredVideo(job.storedRelativePath);
    if (buffer) {
        res.setHeader('Content-Type', job.mimeType || 'video/mp4');
        res.setHeader('Cache-Control', 'private, max-age=3600');
        return res.send(buffer);
    }
    if (job.videoUrl && /^https?:\/\//i.test(job.videoUrl)) {
        return res.redirect(302, job.videoUrl);
    }
    return res.status(404).json({ message: 'Video file is no longer available. Try regenerating.' });
};

const getVideoGenerationStatus = async (req, res) => {
    const probeAuth = String(req.query?.probeAuth || '').toLowerCase() === '1'
        || String(req.query?.probeAuth || '').toLowerCase() === 'true';
    try {
        const payload = await getCombinedVideoStatus({ probeAuth, signal: req.signal });
        return res.status(200).json(payload);
    } catch (error) {
        console.error('[VIDEO_STATUS]', error.message);
        return res.status(503).json({
            success: false,
            code: 'VIDEO_STATUS_UNAVAILABLE',
            message: USER_UNAVAILABLE,
        });
    }
};

module.exports = {
    postVideoGenerate,
    getVideoJob,
    streamVideoJob,
    getVideoGenerationStatus,
};
