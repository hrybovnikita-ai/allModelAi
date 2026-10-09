const { sniffImageMime } = require('../imageProviderAdapter');
const {
    ComfyCloudError,
    comfyCloudRequest,
    getComfyCloudBaseUrl,
    isComfyCloudConfigured,
} = require('./client');
const { buildComfyCloudWorkflow } = require('./workflow');

const TERMINAL_FAILURE = new Set([
    'error',
    'failed',
    'cancelled',
    'non_retryable_error',
    'lost',
]);
const TERMINAL_SUCCESS = new Set(['completed', 'success']);

function pollIntervalMs() {
    const value = Number(process.env.COMFY_CLOUD_POLL_INTERVAL_MS);
    return Number.isFinite(value) && value >= 500 ? value : 2000;
}

function pollTimeoutMs() {
    const value = Number(process.env.COMFY_CLOUD_JOB_TIMEOUT_MS);
    return Number.isFinite(value) && value >= 10000 ? value : 45000;
}

async function submitComfyCloudPrompt(workflow) {
    const { data } = await comfyCloudRequest('/api/prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: workflow }),
    });
    const promptId = data?.prompt_id || data?.promptId;
    if (!promptId) {
        throw new ComfyCloudError('Comfy Cloud did not return a prompt_id.', { status: 502, retryable: true });
    }
    return String(promptId);
}

async function getComfyCloudJobStatus(promptId) {
    const { data } = await comfyCloudRequest(`/api/job/${encodeURIComponent(promptId)}/status`, {
        method: 'GET',
    });
    return {
        status: String(data?.status || '').toLowerCase(),
        errorMessage: data?.error_message || data?.errorMessage || null,
        raw: data,
    };
}

async function waitForComfyCloudJob(promptId, { onProgress } = {}) {
    const started = Date.now();
    const timeoutMs = pollTimeoutMs();
    while (Date.now() - started < timeoutMs) {
        const { status, errorMessage } = await getComfyCloudJobStatus(promptId);
        onProgress?.({ status, elapsedMs: Date.now() - started });
        if (TERMINAL_SUCCESS.has(status)) return { status };
        if (TERMINAL_FAILURE.has(status)) {
            throw new ComfyCloudError(errorMessage || `Comfy Cloud job ${status}.`, {
                status: 502,
                code: 'COMFY_CLOUD_JOB_FAILED',
                retryable: status !== 'cancelled',
            });
        }
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs()));
    }
    throw new ComfyCloudError('Comfy Cloud job timed out while waiting for completion.', {
        status: 504,
        code: 'COMFY_CLOUD_TIMEOUT',
        retryable: true,
    });
}

async function fetchComfyCloudJobOutputs(promptId) {
    const { data } = await comfyCloudRequest(`/api/jobs/${encodeURIComponent(promptId)}`, {
        method: 'GET',
    });
    if (data?.outputs && typeof data.outputs === 'object') {
        return data.outputs;
    }
    const { data: historyData } = await comfyCloudRequest(`/history/${encodeURIComponent(promptId)}`, {
        method: 'GET',
    }).catch(() => ({ data: null }));
    const entry = historyData?.[promptId] || historyData;
    if (entry?.outputs) return entry.outputs;
    throw new ComfyCloudError('Comfy Cloud job completed but returned no outputs.', {
        status: 502,
        retryable: true,
    });
}

function firstOutputImage(outputs) {
    for (const nodeOutputs of Object.values(outputs || {})) {
        for (const fileInfo of nodeOutputs?.images || []) {
            if (fileInfo?.filename) return fileInfo;
        }
    }
    return null;
}

async function downloadComfyCloudImage(fileInfo) {
    const params = new URLSearchParams({
        filename: fileInfo.filename,
        subfolder: fileInfo.subfolder || '',
        type: fileInfo.type || 'output',
    });
    const { comfyCloudAuthHeaders } = require('./client');
    const viewUrl = `${getComfyCloudBaseUrl()}/api/view?${params.toString()}`;
    const headers = comfyCloudAuthHeaders();

    const viewRes = await fetch(viewUrl, {
        headers,
        redirect: 'manual',
        signal: AbortSignal.timeout(Number(process.env.COMFY_CLOUD_TIMEOUT_MS) || 180000),
    });

    let fileRes;
    if (viewRes.status === 302 || viewRes.status === 301) {
        const location = viewRes.headers.get('location');
        if (!location) throw new ComfyCloudError('Comfy Cloud view redirect missing location.', { status: 502, retryable: true });
        fileRes = await fetch(location, { signal: AbortSignal.timeout(120000) });
    } else if (viewRes.ok) {
        fileRes = viewRes;
    } else {
        throw new ComfyCloudError(`Could not download Comfy Cloud output (HTTP ${viewRes.status}).`, {
            status: viewRes.status,
            retryable: viewRes.status >= 500,
        });
    }

    if (!fileRes.ok) {
        throw new ComfyCloudError(`Comfy Cloud image download failed (HTTP ${fileRes.status}).`, {
            status: fileRes.status,
            retryable: fileRes.status >= 500,
        });
    }

    const buffer = Buffer.from(await fileRes.arrayBuffer());
    const mimeType = (fileRes.headers.get('content-type') || '').split(';')[0].toLowerCase() || sniffImageMime(buffer.toString('base64'));
    const base64 = buffer.toString('base64');
    const resolvedMime = mimeType.startsWith('image/') ? mimeType : sniffImageMime(base64);
    return {
        imageUrl: `data:${resolvedMime};base64,${base64}`,
        mimeType: resolvedMime,
        bytes: buffer.length,
    };
}

/**
 * End-to-end text-to-image via Comfy Cloud.
 * @param {{ prompt: string, size?: string, quality?: string, negativePrompt?: string }} options
 */
async function generateComfyCloudImage(options) {
    if (!isComfyCloudConfigured()) {
        throw new ComfyCloudError('COMFY_CLOUD_API_KEY is not configured.', {
            status: 500,
            code: 'COMFY_CLOUD_NOT_CONFIGURED',
            retryable: true,
        });
    }

    const { workflow, checkpoint, steps, width, height } = buildComfyCloudWorkflow({
        prompt: options.prompt,
        size: options.size,
        quality: options.quality,
        negativePrompt: options.negativePrompt,
    });

    const promptId = await submitComfyCloudPrompt(workflow);
    await waitForComfyCloudJob(promptId);
    const outputs = await fetchComfyCloudJobOutputs(promptId);
    const fileInfo = firstOutputImage(outputs);
    if (!fileInfo) {
        throw new ComfyCloudError('Comfy Cloud returned no image files.', { status: 502, retryable: true });
    }
    const downloaded = await downloadComfyCloudImage(fileInfo);

    return {
        ...downloaded,
        promptId,
        model: checkpoint,
        provider: 'comfy-cloud',
        width,
        height,
        steps,
    };
}

module.exports = {
    downloadComfyCloudImage,
    fetchComfyCloudJobOutputs,
    generateComfyCloudImage,
    getComfyCloudJobStatus,
    submitComfyCloudPrompt,
    waitForComfyCloudJob,
};
