/**
 * Cloudflare Workers AI image generation (server-side only).
 * https://developers.cloudflare.com/workers-ai/
 */

const { redactSecrets, sniffImageMime } = require('../imageProviderAdapter');

const DEFAULT_MODEL = '@cf/black-forest-labs/flux-1-schnell';
const MAX_PROMPT_LENGTH = 2048;
const MAX_FLUX_STEPS = 8;
const REQUEST_TIMEOUT_MS = Math.min(Math.max(Number(process.env.CLOUDFLARE_IMAGE_TIMEOUT_MS) || 120000, 15000), 180000);

const strip = (value) => String(value || '').trim().replace(/^["']|["']$/g, '');

function getCloudflareAccountId() {
    return strip(process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CF_ACCOUNT_ID);
}

function getCloudflareApiToken() {
    return strip(
        process.env.CLOUDFLARE_API_TOKEN
        || process.env.CLOUDFLARE_API_KEY
        || process.env.CLAUDEFLARE_API_KEY
        || process.env.AllModelAi_API_KEY_IMAGE,
    );
}

function isLikelyNonCloudflareSecretKey(token) {
    const key = strip(token);
    if (!key) return false;
    return /^sk-/i.test(key);
}

function getCloudflareImageConfig() {
    const apiToken = getCloudflareApiToken();
    return {
        accountId: getCloudflareAccountId(),
        apiToken: apiToken && !isLikelyNonCloudflareSecretKey(apiToken) ? apiToken : '',
        model: normalizeCloudflareModelId(strip(process.env.CLOUDFLARE_IMAGE_MODEL || DEFAULT_MODEL)),
    };
}

function isCloudflareImageConfigured() {
    const { accountId, apiToken } = getCloudflareImageConfig();
    return Boolean(accountId && apiToken);
}

/** FLUX Schnell accepts only prompt, steps (1–8), and optional seed — no width/height/quality. */
function normalizeCloudflareModelId(model) {
    const cleaned = strip(model || DEFAULT_MODEL);
    if (!cleaned.startsWith('@cf/')) return DEFAULT_MODEL;
    return cleaned.replace(/[^\w@./-]/g, '') || DEFAULT_MODEL;
}

function buildRunUrl(accountId, model) {
    const account = strip(accountId);
    const runModel = normalizeCloudflareModelId(model);
    // Model id must stay literal in the path (@cf/...); encoding breaks routing on Workers AI REST.
    return `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/ai/run/${runModel}`;
}

function buildCloudflareFluxRequestBody({ prompt, steps } = {}) {
    const normalizedPrompt = String(prompt || '').replace(/\s+/g, ' ').trim().slice(0, MAX_PROMPT_LENGTH);
    const body = { prompt: normalizedPrompt };
    if (Number.isFinite(steps)) {
        const n = Math.floor(Number(steps));
        if (n >= 1 && n <= MAX_FLUX_STEPS) {
            body.steps = n;
        }
    }
    return body;
}

function classifyCloudflareFailure(status, message) {
    const s = Number(status);
    const blob = String(message || '').toLowerCase();
    if (s === 504 || /timeout|timed out|aborterror/.test(blob)) {
        return { category: 'TIMEOUT', code: 'IMAGE_CLOUDFLARE_TIMEOUT', clientStatus: 504, retryable: true };
    }
    if (s === 429 || /rate limit|too many requests/.test(blob)) {
        return { category: 'RATE_LIMIT', code: 'IMAGE_RATE_LIMIT', clientStatus: 429, retryable: true };
    }
    if (s === 402 || /quota|limit exceeded|insufficient|billing/.test(blob)) {
        return {
            category: 'QUOTA',
            code: 'IMAGE_CLOUDFLARE_QUOTA',
            clientStatus: 402,
            retryable: false,
            message: 'Cloudflare Workers AI quota for this account is exhausted. Try again later or contact the administrator.',
        };
    }
    if (s === 401) {
        return {
            category: 'AUTH',
            code: 'IMAGE_CLOUDFLARE_AUTH',
            clientStatus: 401,
            retryable: false,
            message: 'Cloudflare Workers AI credentials were rejected. Check CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN on the server (Render).',
        };
    }
    if (s === 403) {
        return {
            category: 'AUTH',
            code: 'IMAGE_CLOUDFLARE_FORBIDDEN',
            clientStatus: 403,
            retryable: false,
            message: 'Cloudflare Workers AI access was denied for this account or model.',
        };
    }
    if (s === 400 || /invalid|malformed/.test(blob)) {
        const detail = String(message || '').trim();
        return {
            category: 'INVALID',
            code: 'IMAGE_INVALID_REQUEST',
            clientStatus: 400,
            retryable: false,
            message: detail || 'Cloudflare rejected the image request. Try Standard quality or a shorter prompt.',
        };
    }
    if (s === 404 || /model not found|unknown model/.test(blob)) {
        return {
            category: 'INVALID',
            code: 'IMAGE_CLOUDFLARE_MODEL',
            clientStatus: 400,
            retryable: false,
            message: 'The configured Cloudflare image model is not available for this account.',
        };
    }
    if (s >= 500) {
        return { category: 'UPSTREAM', code: 'IMAGE_CLOUDFLARE_UNAVAILABLE', clientStatus: 502, retryable: true };
    }
    return { category: 'UNKNOWN', code: 'IMAGE_GENERATION_UNAVAILABLE', clientStatus: 502, retryable: true };
}

function parseCloudflareErrorEnvelope(data) {
    if (!data || typeof data !== 'object') {
        return { upstreamCode: null, message: null };
    }
    const entry = Array.isArray(data.errors) ? data.errors[0] : null;
    const upstreamCode = entry?.code ? redactSecrets(String(entry.code)) : null;
    let message = null;
    if (entry?.message) message = redactSecrets(entry.message);
    else if (data.error?.message) message = redactSecrets(data.error.message);
    else if (data.message) message = redactSecrets(data.message);
    return { upstreamCode, message };
}

function extractJsonError(data) {
    return parseCloudflareErrorEnvelope(data).message;
}

function extractImageBase64FromResult(data) {
    if (!data || typeof data !== 'object') return null;
    const result = data.result;
    if (typeof result?.image === 'string' && result.image.length > 0) return result.image;
    if (typeof result === 'string' && result.length > 0) return result;
    if (typeof data.image === 'string' && data.image.length > 0) return data.image;
    return null;
}

async function readCloudflareImagePayload(response) {
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    if (contentType.includes('application/json')) {
        const data = await response.json().catch(() => null);
        if (!response.ok || data?.success === false) {
            const { upstreamCode, message } = parseCloudflareErrorEnvelope(data);
            const detail = message || `Cloudflare HTTP ${response.status}`;
            return { ok: false, status: response.status, detail, upstreamCode, data };
        }
        const base64 = extractImageBase64FromResult(data);
        if (base64) {
            const mimeType = sniffImageMime(base64, 'image/jpeg');
            return {
                ok: true,
                imageUrl: `data:${mimeType};base64,${base64.replace(/\s/g, '')}`,
                mimeType,
            };
        }
        return { ok: false, status: 502, detail: 'Cloudflare returned JSON without an image payload' };
    }

    if (contentType.startsWith('image/')) {
        const buffer = Buffer.from(await response.arrayBuffer());
        if (!response.ok) {
            return { ok: false, status: response.status, detail: `Cloudflare HTTP ${response.status}` };
        }
        const mimeType = contentType.split(';')[0].trim() || 'image/jpeg';
        const base64 = buffer.toString('base64');
        return {
            ok: true,
            imageUrl: `data:${mimeType};base64,${base64}`,
            mimeType,
        };
    }

    const text = await response.text().catch(() => '');
    let data = null;
    try {
        data = JSON.parse(text);
    } catch {
        /* not json */
    }
    if (data) {
        const base64 = extractImageBase64FromResult(data);
        if (base64) {
            const mimeType = sniffImageMime(base64, 'image/jpeg');
            return {
                ok: true,
                imageUrl: `data:${mimeType};base64,${base64.replace(/\s/g, '')}`,
                mimeType,
            };
        }
        const { upstreamCode, message } = parseCloudflareErrorEnvelope(data);
        const detail = message || `Cloudflare HTTP ${response.status}`;
        return { ok: false, status: response.status, detail, upstreamCode, data };
    }

    return {
        ok: false,
        status: response.ok ? 502 : response.status,
        detail: response.ok ? 'Unexpected Cloudflare response format' : `Cloudflare HTTP ${response.status}`,
    };
}

/**
 * @param {{ prompt: string, steps?: number, model?: string, accountId?: string, apiToken?: string }} params
 */
async function generateCloudflareWorkersAiImage(params) {
    const config = getCloudflareImageConfig();
    const accountId = params.accountId || config.accountId;
    const apiToken = params.apiToken || config.apiToken;
    const model = normalizeCloudflareModelId(params.model || config.model);

    if (!accountId || !apiToken) {
        const missing = [];
        if (!accountId) missing.push('CLOUDFLARE_ACCOUNT_ID');
        if (!getCloudflareApiToken()) missing.push('CLOUDFLARE_API_TOKEN or CLOUDFLARE_API_KEY');
        else if (!apiToken) missing.push('CLOUDFLARE_API_TOKEN (must not be an OpenAI sk- key)');
        return {
            ok: false,
            retryable: false,
            status: 502,
            internalMessage: `Cloudflare Workers AI is not fully configured: ${missing.join(', ')}.`,
            code: 'IMAGE_NOT_CONFIGURED',
            clientStatus: 502,
            userMessage: 'Image generation is not configured on the server. Set Cloudflare Workers AI variables on the backend host (Render).',
        };
    }

    const body = buildCloudflareFluxRequestBody({ prompt: params.prompt, steps: params.steps });
    if (!body.prompt) {
        return {
            ok: false,
            retryable: false,
            status: 400,
            internalMessage: 'Image prompt is required.',
            code: 'IMAGE_INVALID_REQUEST',
            clientStatus: 400,
        };
    }

    const requestUrl = buildRunUrl(accountId, model);

    let response;
    try {
        response = await fetch(requestUrl, {
            method: 'POST',
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            headers: {
                Authorization: `Bearer ${apiToken}`,
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            body: JSON.stringify(body),
        });
    } catch (error) {
        const timedOut = error.name === 'TimeoutError' || error.name === 'AbortError';
        const failure = classifyCloudflareFailure(timedOut ? 504 : 502, error.message);
        return {
            ok: false,
            retryable: failure.retryable,
            status: failure.clientStatus,
            internalMessage: redactSecrets(error.message),
            code: failure.code,
            clientStatus: failure.clientStatus,
            userMessage: failure.message,
        };
    }

    console.log('[IMAGE][cloudflare] upstream response', {
        httpStatus: response.status,
        ok: response.ok,
        contentType: String(response.headers.get('content-type') || '').split(';')[0] || null,
        model,
    });

    const parsed = await readCloudflareImagePayload(response);
    if (!parsed.ok) {
        const failure = classifyCloudflareFailure(parsed.status, parsed.detail);
        console.log('[IMAGE][cloudflare] generation failed', {
            httpStatus: parsed.status,
            code: failure.code,
            category: failure.category,
            retryable: failure.retryable,
            upstreamCode: parsed.upstreamCode || undefined,
            upstreamMessage: parsed.detail ? redactSecrets(parsed.detail) : undefined,
            requestKeys: Object.keys(body),
        });
        return {
            ok: false,
            retryable: failure.retryable,
            status: failure.clientStatus,
            internalMessage: parsed.detail,
            code: failure.code,
            clientStatus: failure.clientStatus,
            userMessage: failure.message,
        };
    }

    console.log('[IMAGE][cloudflare] generation succeeded', {
        model,
        mimeType: parsed.mimeType,
        payloadChars: parsed.imageUrl?.length || 0,
    });

    return {
        ok: true,
        imageUrl: parsed.imageUrl,
        mimeType: parsed.mimeType,
        model,
        provider: 'cloudflare',
    };
}

module.exports = {
    DEFAULT_MODEL,
    MAX_PROMPT_LENGTH,
    MAX_FLUX_STEPS,
    buildCloudflareFluxRequestBody,
    buildRunUrl,
    classifyCloudflareFailure,
    extractImageBase64FromResult,
    generateCloudflareWorkersAiImage,
    getCloudflareAccountId,
    getCloudflareApiToken,
    getCloudflareImageConfig,
    isCloudflareImageConfigured,
    isLikelyNonCloudflareSecretKey,
    normalizeCloudflareModelId,
    parseCloudflareErrorEnvelope,
};
