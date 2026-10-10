const {
    generateGeminiVideo,
    GeminiVideoError,
    isGeminiVideoConfigured,
    getGeminiVideoStatus,
} = require('./geminiVideoService');
const {
    MagicHourError,
    createTextToVideoJob,
    createImageToVideoJob,
    uploadImageBytes,
    pollVideoProjectUntilComplete,
    downloadVideoToBuffer,
    getMagicHourVideoStatus,
    mapProviderStatus,
    getVideoProject,
    PROVIDER_ID,
} = require('./magicHourVideoService');
const {
    resolveVideoProviderPreference,
    getMagicHourVideoModel,
    getMagicHourDefaultDurationSeconds,
    isMagicHourConfigured,
} = require('./magicHourConfig');
const {
    createJob,
    updateJob,
    getJobForUser,
    countActiveJobsForUser,
    persistVideoBuffer,
} = require('./videoJobStore');

const MAX_ACTIVE_JOBS_PER_USER = 2;

function publicJobPayload(job, req) {
    const playbackUrl = job.storedRelativePath
        ? `/api/video/jobs/${job.id}/stream`
        : job.videoUrl;
    return {
        jobId: job.id,
        status: job.status,
        provider: job.provider,
        mode: job.mode,
        prompt: job.prompt,
        aspectRatio: job.aspectRatio,
        resolution: job.resolution,
        model: job.model,
        durationSeconds: job.durationSeconds,
        creditsEstimated: job.creditsEstimated,
        creditsCharged: job.creditsCharged,
        videoUrl: job.status === 'completed' ? playbackUrl : null,
        mimeType: job.mimeType,
        errorCode: job.errorCode,
        errorMessage: job.errorMessage,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        success: job.status === 'completed',
    };
}

function completedChatPayload(job, req) {
    const base = publicJobPayload(job, req);
    return {
        success: true,
        provider: job.provider,
        model: job.model,
        aspectRatio: job.aspectRatio,
        resolution: job.resolution,
        mimeType: job.mimeType,
        videoUrl: base.videoUrl,
        jobId: job.id,
        creditsCharged: job.creditsCharged,
    };
}

async function persistRemoteVideo(connection, jobId, remoteUrl, signal) {
    const buffer = await downloadVideoToBuffer(remoteUrl, signal);
    const relative = persistVideoBuffer(jobId, buffer);
    return updateJob(connection, jobId, {
        storedRelativePath: relative,
        videoUrl: remoteUrl,
        mimeType: 'video/mp4',
    });
}

function scheduleJobUpdate(connection, jobId, patch) {
    void updateJob(connection, jobId, patch).catch((error) => {
        console.warn('[VIDEO_JOB]', jobId, error.message);
    });
}

async function runMagicHourJob(connection, job, params, signal) {
    const model = params.model || getMagicHourVideoModel();
    const durationSeconds = params.durationSeconds || getMagicHourDefaultDurationSeconds();
    let providerProjectId = job.providerProjectId;

    await updateJob(connection, job.id, { status: 'preparing', model, durationSeconds: durationSeconds });

    let imageFilePath = null;
    if (params.image?.imageBytes) {
        imageFilePath = await uploadImageBytes({
            imageBytes: params.image.imageBytes,
            mimeType: params.image.mimeType,
            signal,
        });
    }

    await updateJob(connection, job.id, { status: 'queued' });

    const createResponse = params.image?.imageBytes
        ? await createImageToVideoJob({
            prompt: params.prompt,
            imageFilePath,
            aspectRatio: params.aspectRatio,
            resolution: params.resolution,
            model,
            durationSeconds,
            signal,
        })
        : await createTextToVideoJob({
            prompt: params.prompt,
            aspectRatio: params.aspectRatio,
            resolution: params.resolution,
            model,
            durationSeconds,
            signal,
        });

    providerProjectId = createResponse.id;
    await updateJob(connection, job.id, {
        providerProjectId,
        status: 'queued',
        creditsEstimated: createResponse.credits_charged ?? null,
    });

    const result = await pollVideoProjectUntilComplete(providerProjectId, {
        signal,
        onProgress: ({ status, creditsCharged }) => {
            scheduleJobUpdate(connection, job.id, {
                status: status === 'completed' ? 'generating' : status,
                creditsCharged: creditsCharged ?? null,
            });
        },
    });

    await updateJob(connection, job.id, {
        status: 'generating',
        creditsCharged: result.creditsCharged ?? null,
    });

    const withFile = await persistRemoteVideo(connection, job.id, result.videoUrl, signal);
    return updateJob(connection, job.id, {
        status: 'completed',
        creditsCharged: result.creditsCharged ?? withFile.creditsCharged,
        model: model || withFile.model,
    });
}

async function runGeminiJob(connection, job, params, signal) {
    await updateJob(connection, job.id, { status: 'generating', provider: 'google-veo' });
    const result = await generateGeminiVideo({ ...params, signal });
    let storedRelativePath = null;
    if (result.videoUrl?.startsWith('data:')) {
        const base64 = result.videoUrl.split(',')[1];
        storedRelativePath = persistVideoBuffer(job.id, Buffer.from(base64, 'base64'));
    }
    return updateJob(connection, job.id, {
        status: 'completed',
        videoUrl: storedRelativePath ? `/api/video/jobs/${job.id}/stream` : result.videoUrl,
        storedRelativePath,
        mimeType: result.mimeType,
        model: result.model,
    });
}

async function startVideoGeneration({ connection, email, params, wait = true, signal }) {
    const { getCreditStatusCoreAsync } = require('../billing/creditStatusAsync');
    const { assertVideoGenerationAllowed } = require('./videoAccess');
    const creditStatus = await getCreditStatusCoreAsync(connection, email);
    assertVideoGenerationAllowed(creditStatus);

    const provider = resolveVideoProviderPreference(params.provider);
    if (provider === 'magichour' && !isMagicHourConfigured()) {
        throw new MagicHourError('Magic Hour is not configured. Set MAGIC_HOUR_API_KEY on the server.', {
            status: 503,
            code: 'MAGIC_HOUR_NOT_CONFIGURED',
        });
    }
    if (provider === 'gemini' && !isGeminiVideoConfigured()) {
        throw new GeminiVideoError('Video generation is not configured. Add GEMINI_API_KEY or MAGIC_HOUR_API_KEY.', {
            status: 503,
            code: 'VIDEO_NOT_CONFIGURED',
        });
    }

    if (await countActiveJobsForUser(connection, email) >= MAX_ACTIVE_JOBS_PER_USER) {
        throw new MagicHourError('You already have video jobs in progress. Wait for them to finish before starting another.', {
            status: 429,
            code: 'VIDEO_JOB_LIMIT',
            retryable: true,
        });
    }

    const mode = params.image?.imageBytes ? 'image-to-video' : 'text-to-video';
    const job = await createJob(connection, {
        email,
        provider: provider === 'magichour' ? PROVIDER_ID : 'google-veo',
        mode,
        prompt: params.prompt,
        status: 'preparing',
        aspectRatio: params.aspectRatio,
        resolution: params.resolution,
        model: params.model || (provider === 'magichour' ? getMagicHourVideoModel() : null),
        durationSeconds: params.durationSeconds,
    });

    const runner = provider === 'magichour'
        ? () => runMagicHourJob(connection, job, params, signal)
        : () => runGeminiJob(connection, job, params, signal);

    if (!wait) {
        void runner().catch((error) => {
            void updateJob(connection, job.id, {
                status: 'failed',
                errorCode: error.code || 'VIDEO_FAILED',
                errorMessage: error.message,
            });
        });
        return await getJobForUser(connection, job.id, email);
    }

    try {
        return await runner();
    } catch (error) {
        await updateJob(connection, job.id, {
            status: 'failed',
            errorCode: error.code || 'VIDEO_FAILED',
            errorMessage: error.message,
        });
        throw error;
    }
}

async function refreshJobFromProvider(connection, job, signal) {
    if (job.provider !== PROVIDER_ID || !job.providerProjectId) return job;
    if (['completed', 'failed'].includes(job.status)) return job;
    const details = await getVideoProject(job.providerProjectId, signal);
    const mapped = mapProviderStatus(details.status);
    if (mapped === 'completed') {
        const download = details.downloads?.[0];
        if (download?.url) {
            const persisted = await persistRemoteVideo(connection, job.id, download.url, signal);
            return updateJob(connection, job.id, {
                status: 'completed',
                creditsCharged: details.credits_charged ?? persisted.creditsCharged,
            });
        }
    }
    if (mapped === 'failed') {
        return updateJob(connection, job.id, {
            status: 'failed',
            errorCode: details?.error?.code || 'MAGIC_HOUR_VIDEO_FAILED',
            errorMessage: details?.error?.message || 'Video generation failed.',
        });
    }
    return updateJob(connection, job.id, {
        status: mapped,
        creditsCharged: details.credits_charged ?? job.creditsCharged,
    });
}

async function getCombinedVideoStatus({ probeAuth = false, signal } = {}) {
    let authProbe = null;
    if (probeAuth) {
        const { probeMagicHourAuth } = require('./magicHourClient');
        authProbe = await probeMagicHourAuth({ signal });
    }
    const magicHour = getMagicHourVideoStatus(authProbe);
    const gemini = getGeminiVideoStatus();
    const provider = resolveVideoProviderPreference();
    return {
        configured: provider === 'magichour' ? magicHour.configured : gemini.configured,
        activeProvider: provider,
        providers: {
            magichour: magicHour,
            gemini,
        },
        magicHourConfigured: magicHour.configured,
        geminiConfigured: gemini.configured,
        routes: {
            statusGet: 'GET /api/videos/status',
            generatePost: 'POST /api/video/generate',
            generatePostAlias: 'POST /api/videos',
            jobGet: 'GET /api/video/jobs/:jobId',
            streamGet: 'GET /api/video/jobs/:jobId/stream',
        },
    };
}

module.exports = {
    startVideoGeneration,
    refreshJobFromProvider,
    publicJobPayload,
    completedChatPayload,
    getCombinedVideoStatus,
    MagicHourError,
    GeminiVideoError,
};
