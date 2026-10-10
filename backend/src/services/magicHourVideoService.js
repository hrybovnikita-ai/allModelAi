const { magicHourRequest, MagicHourError } = require('./magicHourClient');
const {
    getMagicHourDefaultDurationSeconds,
    getMagicHourVideoModel,
    pollIntervalMs,
    pollTimeoutMs,
} = require('./magicHourConfig');

const PROVIDER_ID = 'magic-hour';

function mapProviderStatus(status) {
    const value = String(status || '').toLowerCase();
    if (value === 'queued' || value === 'draft') return 'queued';
    if (value === 'rendering') return 'generating';
    if (value === 'complete') return 'completed';
    if (value === 'canceled') return 'failed';
    if (value === 'error') return 'failed';
    return 'generating';
}

function extensionForMime(mimeType) {
    const mime = String(mimeType || '').toLowerCase();
    if (mime.includes('png')) return 'png';
    if (mime.includes('webp')) return 'webp';
    if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
    return 'png';
}

async function uploadImageBytes({ imageBytes, mimeType, signal }) {
    const extension = extensionForMime(mimeType);
    const uploadMeta = await magicHourRequest('/v1/files/upload-urls', {
        method: 'POST',
        body: { items: [{ type: 'image', extension }] },
        signal,
    });
    const item = uploadMeta?.items?.[0];
    if (!item?.upload_url || !item?.file_path) {
        throw new MagicHourError('Could not prepare image upload for Magic Hour.', {
            status: 502,
            code: 'MAGIC_HOUR_UPLOAD_FAILED',
            retryable: true,
        });
    }
    const buffer = Buffer.from(String(imageBytes).replace(/\s/g, ''), 'base64');
    const putResponse = await fetch(item.upload_url, {
        method: 'PUT',
        body: buffer,
        headers: { 'Content-Type': mimeType || 'image/png' },
        signal,
    });
    if (!putResponse.ok) {
        throw new MagicHourError('Image upload to Magic Hour failed.', {
            status: 502,
            code: 'MAGIC_HOUR_UPLOAD_FAILED',
            retryable: true,
        });
    }
    return item.file_path;
}

async function createTextToVideoJob({
    prompt,
    aspectRatio,
    resolution,
    model,
    durationSeconds,
    signal,
}) {
    const body = {
        name: 'AllModelAI text-to-video',
        end_seconds: durationSeconds,
        aspect_ratio: aspectRatio,
        resolution,
        model,
        style: { prompt },
    };
    return magicHourRequest('/v1/text-to-video', { method: 'POST', body, signal });
}

async function createImageToVideoJob({
    prompt,
    imageFilePath,
    aspectRatio,
    resolution,
    model,
    durationSeconds,
    signal,
}) {
    const body = {
        name: 'AllModelAI image-to-video',
        end_seconds: durationSeconds,
        aspect_ratio: aspectRatio,
        resolution,
        model,
        assets: { image_file_path: imageFilePath },
    };
    if (prompt) body.style = { prompt };
    return magicHourRequest('/v1/image-to-video', { method: 'POST', body, signal });
}

async function getVideoProject(projectId, signal) {
    return magicHourRequest(`/v1/video-projects/${encodeURIComponent(projectId)}`, { signal });
}

async function fetchAccountCredits(signal) {
    try {
        const data = await magicHourRequest('/v1/account', { signal, timeoutMs: 15000 });
        return {
            creditsRemaining: data?.credits_remaining ?? data?.creditsRemaining ?? null,
            subscription: data?.subscription ?? null,
        };
    } catch {
        return { creditsRemaining: null, subscription: null };
    }
}

async function pollVideoProjectUntilComplete(projectId, {
    onProgress,
    signal,
} = {}) {
    const started = Date.now();
    let delay = pollIntervalMs();
    while (Date.now() - started < pollTimeoutMs()) {
        if (signal?.aborted) {
            throw new MagicHourError('Video generation was canceled.', {
                status: 499,
                code: 'VIDEO_CANCELED',
                retryable: false,
            });
        }
        const details = await getVideoProject(projectId, signal);
        const mapped = mapProviderStatus(details.status);
        onProgress?.({
            providerStatus: details.status,
            status: mapped,
            creditsCharged: details.credits_charged,
        });
        if (mapped === 'completed') {
            const download = Array.isArray(details.downloads) ? details.downloads[0] : null;
            if (!download?.url) {
                throw new MagicHourError('Magic Hour completed without a downloadable video.', {
                    status: 502,
                    code: 'MAGIC_HOUR_NO_OUTPUT',
                    retryable: true,
                });
            }
            return {
                videoUrl: download.url,
                expiresAt: download.expires_at || null,
                creditsCharged: details.credits_charged,
                model: details.type || 'TEXT_TO_VIDEO',
                providerStatus: details.status,
            };
        }
        if (mapped === 'failed') {
            throw new MagicHourError(
                details?.error?.message || 'Magic Hour video generation failed.',
                {
                    status: 502,
                    code: details?.error?.code || 'MAGIC_HOUR_VIDEO_FAILED',
                    retryable: false,
                },
            );
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay = Math.min(Math.round(delay * 1.25), 20000);
    }
    throw new MagicHourError('Video generation timed out. Check your job later from chat history.', {
        status: 504,
        code: 'MAGIC_HOUR_TIMEOUT',
        retryable: true,
    });
}

async function downloadVideoToBuffer(url, signal) {
    const response = await fetch(url, { signal: signal || AbortSignal.timeout(180000) });
    if (!response.ok) {
        throw new MagicHourError('Could not download the completed video from Magic Hour.', {
            status: 502,
            code: 'MAGIC_HOUR_DOWNLOAD_FAILED',
            retryable: true,
        });
    }
    return Buffer.from(await response.arrayBuffer());
}

function getMagicHourVideoStatus(authProbe = null) {
    const { isMagicHourConfigured, getMagicHourKeyDiagnostics } = require('./magicHourConfig');
    const diagnostics = getMagicHourKeyDiagnostics();
    return {
        configured: isMagicHourConfigured(),
        ...diagnostics,
        provider: PROVIDER_ID,
        model: getMagicHourVideoModel(),
        defaultDurationSeconds: getMagicHourDefaultDurationSeconds(),
        supportsTextToVideo: true,
        supportsImageToVideo: true,
        ...(authProbe ? { authProbe } : {}),
    };
}

module.exports = {
    PROVIDER_ID,
    MagicHourError,
    mapProviderStatus,
    uploadImageBytes,
    createTextToVideoJob,
    createImageToVideoJob,
    getVideoProject,
    pollVideoProjectUntilComplete,
    fetchAccountCredits,
    downloadVideoToBuffer,
    getMagicHourVideoStatus,
};
