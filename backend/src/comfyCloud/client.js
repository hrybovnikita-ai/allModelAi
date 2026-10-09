const { redactSecrets } = require('../imageProviderAdapter');

const strip = (value) => String(value || '').trim().replace(/^["']|["']$/g, '');

const DEFAULT_BASE_URL = 'https://cloud.comfy.org';

function getComfyCloudApiKey() {
    return strip(process.env.COMFY_CLOUD_API_KEY) || strip(process.env.COMFYUI_API_KEY);
}

function isComfyCloudConfigured() {
    return Boolean(getComfyCloudApiKey());
}

function getComfyCloudBaseUrl() {
    const base = strip(process.env.COMFY_CLOUD_BASE_URL) || DEFAULT_BASE_URL;
    return base.replace(/\/$/, '');
}

function comfyCloudAuthHeaders() {
    const key = getComfyCloudApiKey();
    if (!key) {
        console.error('[API Error] COMFY_CLOUD_API_KEY is not set (COMFYUI_API_KEY also empty)');
        const error = new Error('COMFY_CLOUD_API_KEY is not configured on the server.');
        error.code = 'COMFY_CLOUD_NOT_CONFIGURED';
        throw error;
    }
    const authMode = strip(process.env.COMFY_CLOUD_AUTH_HEADER).toLowerCase();
    if (authMode === 'bearer') {
        return { Authorization: `Bearer ${key}` };
    }
    return { 'X-API-Key': key };
}

function parseComfyCloudError(data, response, rawText = '') {
    if (data?.message) return redactSecrets(String(data.message));
    if (data?.error) {
        if (typeof data.error === 'string') return redactSecrets(data.error);
        if (data.error.message) return redactSecrets(String(data.error.message));
    }
    if (typeof data?.detail === 'string') return redactSecrets(data.detail);
    if (rawText) return redactSecrets(rawText.slice(0, 500));
    return `Comfy Cloud HTTP ${response?.status || 'error'}`;
}

class ComfyCloudError extends Error {
    constructor(message, { status = 502, code = 'COMFY_CLOUD_ERROR', retryable = false } = {}) {
        super(message);
        this.name = 'ComfyCloudError';
        this.status = status;
        this.code = code;
        this.retryable = retryable;
    }
}

async function comfyCloudRequest(path, options = {}) {
    const url = `${getComfyCloudBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`;
    const timeoutMs = Number(process.env.COMFY_CLOUD_TIMEOUT_MS) || 180000;
    const headers = {
        ...comfyCloudAuthHeaders(),
        Accept: 'application/json',
        ...(options.headers || {}),
    };
    let response;
    try {
        response = await fetch(url, {
            ...options,
            headers,
            signal: options.signal || AbortSignal.timeout(timeoutMs),
        });
    } catch (error) {
        if (error.name === 'TimeoutError' || error.name === 'AbortError') {
            throw new ComfyCloudError('Comfy Cloud request timed out.', { status: 504, code: 'COMFY_CLOUD_TIMEOUT', retryable: true });
        }
        throw new ComfyCloudError(redactSecrets(error.message), { status: 502, retryable: true });
    }

    const contentType = response.headers.get('content-type') || '';
    const rawText = contentType.includes('json') ? '' : await response.text().catch(() => '');
    const data = contentType.includes('json') ? await response.json().catch(() => null) : null;

    if (!response.ok) {
        const message = parseComfyCloudError(data, response, rawText);
        console.error('[API Error] Comfy Cloud HTTP', response.status, {
            path,
            body: data || rawText?.slice(0, 500) || null,
        });
        const retryable = [408, 409, 429, 500, 502, 503, 504].includes(response.status)
            || response.status === 402
            || response.status === 403
            || /rate limit|timeout|unavailable|credit|quota|free tier/i.test(message);
        throw new ComfyCloudError(message, {
            status: response.status,
            code: response.status === 401 || response.status === 403 ? 'COMFY_CLOUD_AUTH' : 'COMFY_CLOUD_UPSTREAM',
            retryable,
        });
    }

    return { response, data };
}

module.exports = {
    ComfyCloudError,
    comfyCloudRequest,
    comfyCloudAuthHeaders,
    getComfyCloudApiKey,
    getComfyCloudBaseUrl,
    isComfyCloudConfigured,
    parseComfyCloudError,
};
