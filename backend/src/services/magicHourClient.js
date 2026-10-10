const { getMagicHourApiKey } = require('./magicHourConfig');

const API_BASE = 'https://api.magichour.ai';

class MagicHourError extends Error {
    constructor(message, options = {}) {
        super(message);
        this.name = 'MagicHourError';
        this.status = options.status || 502;
        this.code = options.code || 'MAGIC_HOUR_ERROR';
        this.retryable = Boolean(options.retryable);
        this.retryAfterSeconds = options.retryAfterSeconds ?? null;
        this.providerCode = options.providerCode || null;
        this.providerRejected = Boolean(options.providerRejected);
        this.keyConfigured = Boolean(options.keyConfigured);
        this.providerHttpStatus = options.providerHttpStatus ?? null;
    }
}

function sanitizeMessage(message) {
    return String(message || '')
        .replace(/mhk_[a-z0-9_]+/gi, '[redacted]')
        .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
        .slice(0, 500);
}

function mapMagicHourHttpError(status, data, retryAfterHeader, { keyConfigured = false } = {}) {
    const providerCode = data?.code || null;
    const message = sanitizeMessage(data?.message || 'Magic Hour request failed.');
    const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : null;

    if (status === 401) {
        const unauthorizedMessage = keyConfigured
            ? 'Magic Hour rejected the API key (HTTP 401). Create or regenerate a key in the Magic Hour Developer Hub, set MAGIC_HOUR_API_KEY in backend/.env, and restart the backend.'
            : 'Magic Hour is not configured. Set MAGIC_HOUR_API_KEY in backend/.env and restart the backend.';
        return new MagicHourError(unauthorizedMessage, {
            status: keyConfigured ? 401 : 503,
            code: keyConfigured ? 'MAGIC_HOUR_UNAUTHORIZED' : 'MAGIC_HOUR_NOT_CONFIGURED',
            retryable: false,
            providerCode,
            providerRejected: keyConfigured,
            keyConfigured,
            providerHttpStatus: 401,
        });
    }
    if (status === 402) {
        const code = providerCode === 'subscription_required'
            ? 'MAGIC_HOUR_SUBSCRIPTION_REQUIRED'
            : providerCode === 'plan_upgrade_required'
                ? 'MAGIC_HOUR_PLAN_UPGRADE'
                : 'MAGIC_HOUR_INSUFFICIENT_CREDITS';
        return new MagicHourError(
            code === 'MAGIC_HOUR_INSUFFICIENT_CREDITS'
                ? 'Magic Hour API credits are insufficient for this video. Add API credits in the Magic Hour Developer Hub (separate from website credits).'
                : message,
            { status: 402, code, retryable: false, providerCode },
        );
    }
    if (status === 429) {
        return new MagicHourError('Magic Hour rate limit reached. Please try again later.', {
            status: 429,
            code: 'MAGIC_HOUR_RATE_LIMIT',
            retryable: true,
            retryAfterSeconds,
            providerCode,
        });
    }
    if (status === 400 || status === 422) {
        return new MagicHourError(message || 'Invalid video generation request.', {
            status: 400,
            code: 'MAGIC_HOUR_INVALID_REQUEST',
            retryable: false,
            providerCode,
        });
    }
    if (status >= 500) {
        return new MagicHourError('Magic Hour is temporarily unavailable. Please try again later.', {
            status: 503,
            code: 'MAGIC_HOUR_UNAVAILABLE',
            retryable: true,
            providerCode,
        });
    }
    return new MagicHourError(message, {
        status: status >= 400 && status < 600 ? status : 502,
        code: 'MAGIC_HOUR_ERROR',
        retryable: status >= 500,
        providerCode,
    });
}

async function magicHourRequest(path, { method = 'GET', body, signal, timeoutMs = 120000 } = {}) {
    const apiKey = getMagicHourApiKey();
    if (!apiKey) {
        throw new MagicHourError('Magic Hour is not configured. Set MAGIC_HOUR_API_KEY on the server.', {
            status: 503,
            code: 'MAGIC_HOUR_NOT_CONFIGURED',
            retryable: false,
        });
    }

    const response = await fetch(`${API_BASE}${path}`, {
        method,
        headers: {
            Authorization: `Bearer ${apiKey}`,
            Accept: 'application/json',
            ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: signal || AbortSignal.timeout(timeoutMs),
    });

    const text = await response.text();
    let data = {};
    try {
        data = text ? JSON.parse(text) : {};
    } catch {
        data = { message: text.slice(0, 200) };
    }

    if (!response.ok) {
        throw mapMagicHourHttpError(
            response.status,
            data,
            response.headers.get('retry-after'),
            { keyConfigured: true },
        );
    }
    return data;
}

/** Lightweight auth check — does not create billable video jobs. */
async function probeMagicHourAuth({ signal, timeoutMs = 12000 } = {}) {
    const apiKey = getMagicHourApiKey();
    if (!apiKey) {
        return {
            ok: false,
            httpStatus: null,
            providerCode: null,
            keyConfigured: false,
        };
    }
    try {
        const response = await fetch(`${API_BASE}/v1/account`, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                Accept: 'application/json',
            },
            signal: signal || AbortSignal.timeout(timeoutMs),
        });
        if (response.ok) {
            return {
                ok: true,
                httpStatus: response.status,
                providerCode: null,
                keyConfigured: true,
            };
        }
        const text = await response.text();
        let data = {};
        try {
            data = text ? JSON.parse(text) : {};
        } catch {
            data = {};
        }
        return {
            ok: false,
            httpStatus: response.status,
            providerCode: data?.code || null,
            keyConfigured: true,
        };
    } catch (error) {
        return {
            ok: false,
            httpStatus: null,
            providerCode: null,
            keyConfigured: true,
            transient: true,
            errorName: error?.name || 'Error',
        };
    }
}

module.exports = {
    MagicHourError,
    magicHourRequest,
    mapMagicHourHttpError,
    probeMagicHourAuth,
    API_BASE,
};
