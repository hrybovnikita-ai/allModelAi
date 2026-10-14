/**
 * Google Gemini API helpers (server-side only). Never log API keys.
 */

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

function envTrim(name) {
    return String(process.env[name] || '').trim();
}

function getGeminiApiKey() {
    return envTrim('GEMINI_API_KEY');
}

function isGeminiConfigured() {
    return Boolean(getGeminiApiKey());
}

function normalizeModelId(name) {
    const raw = String(name || '').trim();
    if (!raw) return '';
    return raw.replace(/^models\//, '');
}

function buildGeminiUrl(path, apiKey) {
    const key = apiKey || getGeminiApiKey();
    const sep = path.includes('?') ? '&' : '?';
    return `${GEMINI_API_BASE}${path}${sep}key=${encodeURIComponent(key)}`;
}

/**
 * @returns {{ errorClass: string, clientStatus: number, message: string, retryable: boolean }}
 */
function mapGeminiHttpError(httpStatus, detailMessage = '') {
    const status = Number(httpStatus) || 0;
    const detail = String(detailMessage || '').toLowerCase();

    if (status === 401 || /api key not valid|invalid api key|unauthenticated/i.test(detail)) {
        return {
            errorClass: 'authentication_failed',
            clientStatus: 401,
            message: 'Gemini rejected the API key. Check GEMINI_API_KEY on the server.',
            retryable: false,
        };
    }
    if (status === 403 || /permission|forbidden|api has not been used|disabled/i.test(detail)) {
        return {
            errorClass: 'permission_denied',
            clientStatus: 403,
            message: 'Gemini access is forbidden for this API key or model. Enable the Generative Language API in Google Cloud.',
            retryable: false,
        };
    }
    if (status === 404 || /not found|is not found|does not exist/i.test(detail)) {
        return {
            errorClass: 'model_not_found',
            clientStatus: 404,
            message: 'The requested Gemini model ID is not available for this API key.',
            retryable: false,
        };
    }
    if (status === 429 || /quota|rate limit|resource exhausted|too many requests/i.test(detail)) {
        return {
            errorClass: 'rate_limited',
            clientStatus: 429,
            message: 'Gemini rate limit or quota exceeded. Wait and retry or review quota in Google AI Studio.',
            retryable: true,
        };
    }
    if (status === 400) {
        return {
            errorClass: 'invalid_request',
            clientStatus: 400,
            message: 'Gemini could not process this request.',
            retryable: false,
        };
    }
    if (status >= 500) {
        return {
            errorClass: 'server_error',
            clientStatus: 502,
            message: 'Gemini is temporarily unavailable.',
            retryable: true,
        };
    }
    return {
        errorClass: 'upstream_error',
        clientStatus: status >= 400 && status < 600 ? status : 502,
        message: 'Gemini request failed.',
        retryable: status >= 500,
    };
}

async function parseGeminiErrorResponse(response) {
    const data = await response.json().catch(() => ({}));
    const message = data?.error?.message || data?.error?.status || '';
    return { data, message: String(message || '') };
}

/** List models visible to the configured API key. */
async function listGeminiModels({ apiKey, fetchImpl = globalThis.fetch, signal } = {}) {
    const key = apiKey || getGeminiApiKey();
    if (!key) {
        return { ok: false, status: 503, error: mapGeminiHttpError(503, 'missing key'), models: [] };
    }
    const url = buildGeminiUrl('/models', key);
    let response;
    try {
        response = await fetchImpl(url, { signal });
    } catch (error) {
        return {
            ok: false,
            status: 503,
            error: mapGeminiHttpError(504, error.message),
            models: [],
        };
    }
    if (!response.ok) {
        const { message } = await parseGeminiErrorResponse(response);
        return {
            ok: false,
            status: response.status,
            error: mapGeminiHttpError(response.status, message),
            models: [],
        };
    }
    const payload = await response.json();
    const models = (payload.models || []).map((m) => ({
        apiId: normalizeModelId(m.name),
        displayName: m.displayName || m.name,
        description: m.description || '',
        version: m.version || '',
        supportedGenerationMethods: m.supportedGenerationMethods || [],
        inputTokenLimit: m.inputTokenLimit ?? null,
        outputTokenLimit: m.outputTokenLimit ?? null,
    }));
    return { ok: true, status: 200, models };
}

function supportsGenerateContent(model) {
    return (model.supportedGenerationMethods || []).includes('generateContent');
}

/** Flash / Flash-Lite / Pro family models that support generateContent. */
function filterGeminiCatalogModels(models) {
    const re = /flash-lite|flash|pro/i;
    return models.filter((m) => supportsGenerateContent(m) && re.test(`${m.apiId} ${m.displayName}`));
}

function resolveDefaultGeminiChatModel(envModel, catalogModels = []) {
    const configured = envTrim('GEMINI_MODEL') || envTrim(envModel) || '';
    if (configured) return normalizeModelId(configured);
    const ids = catalogModels.map((m) => m.apiId);
    const pick = (pattern) => ids.find((id) => pattern.test(id));
    return pick(/^gemini-2\.5-flash-lite/) || pick(/^gemini-2\.5-flash(?!-lite)/) || pick(/^gemini-2\.0-flash-lite/) || pick(/^gemini-2\.0-flash/) || pick(/flash-lite/) || pick(/flash/) || ids[0] || 'gemini-2.5-flash';
}

async function testGeminiGenerateContent(modelId, {
    prompt = 'Hello, respond with OK',
    apiKey,
    fetchImpl = globalThis.fetch,
    signal,
    timeoutMs = 30000,
} = {}) {
    const key = apiKey || getGeminiApiKey();
    const id = normalizeModelId(modelId);
    if (!key) {
        return { ok: false, modelId: id, error: mapGeminiHttpError(503, 'missing key') };
    }
    const url = buildGeminiUrl(`/models/${encodeURIComponent(id)}:generateContent`, key);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const mergedSignal = signal || controller.signal;
    try {
        const response = await fetchImpl(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: mergedSignal,
            body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                generationConfig: { maxOutputTokens: 32 },
            }),
        });
        if (!response.ok) {
            const { message } = await parseGeminiErrorResponse(response);
            return { ok: false, modelId: id, httpStatus: response.status, error: mapGeminiHttpError(response.status, message) };
        }
        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
        return {
            ok: Boolean(String(text).trim()),
            modelId: id,
            httpStatus: 200,
            preview: String(text).trim().slice(0, 120),
            usageMetadata: data.usageMetadata || null,
        };
    } catch (error) {
        const timedOut = error.name === 'AbortError' || /abort/i.test(error.message);
        return {
            ok: false,
            modelId: id,
            error: mapGeminiHttpError(timedOut ? 504 : 503, error.message),
        };
    } finally {
        clearTimeout(timer);
    }
}

module.exports = {
    GEMINI_API_BASE,
    buildGeminiUrl,
    filterGeminiCatalogModels,
    getGeminiApiKey,
    isGeminiConfigured,
    listGeminiModels,
    mapGeminiHttpError,
    normalizeModelId,
    resolveDefaultGeminiChatModel,
    supportsGenerateContent,
    testGeminiGenerateContent,
};
