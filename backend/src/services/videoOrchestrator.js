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
    pollTimeoutMs,
} = require('./magicHourConfig');
const {
    createJob,
    updateJob,
    getJobForUser,
    countActiveJobsForUser,
    findRecentDuplicateJob,
    listActiveJobsForUser,
    persistVideoBuffer,
} = require('./videoJobStore');
const { resolveVideoImageFromBody } = require('./videoImageResolve');
const { assertMagicHourRequestSupported } = require('./magicHourCapabilities');
const { assertMagicHourAuthReady, fetchAccountCredits } = require('./magicHourVideoService');

const MAX_ACTIVE_JOBS_PER_USER = 2;

function createDetachedVideoSignal() {
    const timeoutMs = pollTimeoutMs() + 120000;
    if (typeof AbortSignal.timeout === 'function') {
        return AbortSignal.timeout(timeoutMs);
    }
    const controller = new AbortController();
    setTimeout(() => controller.abort(), timeoutMs).unref?.();
    return controller.signal;
}

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
        recovered: Boolean(job.recovered),
        providerProjectId: job.providerProjectId || null,
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
    const completed = await updateJob(connection, job.id, {
        status: 'completed',
        creditsCharged: result.creditsCharged ?? withFile.creditsCharged,
        model: model || withFile.model,
    });
    const { syncCompletedVideoJobToConversation } = require('./chatConversationVideoSync');
    setImmediate(() => {
        void syncCompletedVideoJobToConversation(connection, job.email, job.id).catch((error) => {
            console.warn('[VIDEO_JOB] conversation sync failed', job.id, error.message);
        });
    });
    return completed;
}

async function runGeminiJob(connection, job, params, signal) {
    await updateJob(connection, job.id, { status: 'generating', provider: 'google-veo' });
    const result = await generateGeminiVideo({ ...params, signal });
    let storedRelativePath = null;
    if (result.videoUrl?.startsWith('data:')) {
        const base64 = result.videoUrl.split(',')[1];
        storedRelativePath = persistVideoBuffer(job.id, Buffer.from(base64, 'base64'));
    }
    const completed = await updateJob(connection, job.id, {
        status: 'completed',
        videoUrl: storedRelativePath ? `/api/video/jobs/${job.id}/stream` : result.videoUrl,
        storedRelativePath,
        mimeType: result.mimeType,
        model: result.model,
    });
    const { syncCompletedVideoJobToConversation } = require('./chatConversationVideoSync');
    setImmediate(() => {
        void syncCompletedVideoJobToConversation(connection, job.email, job.id).catch((error) => {
            console.warn('[VIDEO_JOB] conversation sync failed', job.id, error.message);
        });
    });
    return completed;
}

async function startVideoGeneration({ connection, email, params, wait = true, signal, requestBaseUrl }) {
    const { getCreditStatusCoreAsync } = require('../billing/creditStatusAsync');
    const { assertVideoGenerationAllowed } = require('./videoAccess');
    const creditStatus = await getCreditStatusCoreAsync(connection, email);
    assertVideoGenerationAllowed(creditStatus);

    let authProbe = null;
    if (isMagicHourConfigured()) {
        const { probeMagicHourAuth } = require('./magicHourClient');
        authProbe = await probeMagicHourAuth({ signal });
    }

    const provider = resolveVideoProviderPreference(params.provider, {
        magicHourAuthOk: authProbe?.ok === true ? true : (authProbe?.keyConfigured ? false : null),
    });
    if (provider === 'magichour') {
        await assertMagicHourAuthReady({ signal });
        const normalized = assertMagicHourRequestSupported(params);
        params = { ...params, ...normalized };
    }
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

    if (params.image?.imageBytes) {
        params = { ...params, image: params.image };
    } else if (params.imageUrl || params.image) {
        const resolvedImage = await resolveVideoImageFromBody(params, { baseUrl: requestBaseUrl, signal });
        if (resolvedImage) params = { ...params, image: resolvedImage };
    }

    const duplicate = await findRecentDuplicateJob(connection, email, params);
    if (duplicate) {
        return { ...duplicate, recovered: true };
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
        conversationId: params.conversationId || null,
        messageId: params.messageId || null,
    });

    const workerSignal = wait ? (signal || createDetachedVideoSignal()) : createDetachedVideoSignal();
    const runner = provider === 'magichour'
        ? () => runMagicHourJob(connection, job, params, workerSignal)
        : () => runGeminiJob(connection, job, params, workerSignal);

    const handleRunnerFailure = async (error) => {
        await updateJob(connection, job.id, {
            status: 'failed',
            errorCode: error.code || 'VIDEO_FAILED',
            errorMessage: error.message,
        });
    };

    if (!wait) {
        setImmediate(() => {
            void runner().catch((error) => {
                void handleRunnerFailure(error);
            });
        });
        return await getJobForUser(connection, job.id, email);
    }

    try {
        return await runner();
    } catch (error) {
        await handleRunnerFailure(error);
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

async function listVideoJobsForUser(connection, email) {
    return listActiveJobsForUser(connection, email, { limit: 20 });
}

async function getCombinedVideoStatus({ probeAuth = false, signal } = {}) {
    let authProbe = null;
    let account = null;
    if (isMagicHourConfigured() && (probeAuth || process.env.VIDEO_PROBE_AUTH !== 'false')) {
        const { probeMagicHourAuth } = require('./magicHourClient');
        authProbe = await probeMagicHourAuth({ signal });
        if (authProbe.ok) {
            account = await fetchAccountCredits(signal);
        }
    }
    const magicHour = getMagicHourVideoStatus(authProbe, account);
    const gemini = getGeminiVideoStatus();
    const provider = resolveVideoProviderPreference('', {
        magicHourAuthOk: authProbe?.ok === true ? true : (authProbe?.keyConfigured ? false : null),
    });
    return {
        configured: provider === 'magichour' ? magicHour.ready === true : gemini.configured,
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
    listVideoJobsForUser,
    MagicHourError,
    GeminiVideoError,
};
