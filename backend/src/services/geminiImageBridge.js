/**
 * Proxies Gemini Flash Lite image generation to the ai_python FastAPI service.
 * Requires GEMINI_API_KEY in the Node process environment (passed to the Python child on spawn).
 */

const { ensureServerRunning, isServerHealthy, fetchPython, PYTHON_FETCH_TIMEOUT_MS } = require('./aiPythonBridge');
const { redactSecrets, sniffImageMime } = require('../imageProviderAdapter');

const GEMINI_IMAGE_TIMEOUT_MS = Math.max(
    60000,
    parseInt(process.env.GEMINI_IMAGE_TIMEOUT_MS || String(Math.max(PYTHON_FETCH_TIMEOUT_MS, 180000)), 10),
);

async function verifyGeminiImageAccess() {
    try {
        await ensureServerRunning();
        if (!(await isServerHealthy())) {
            return {
                ok: false,
                configured: false,
                code: 'PYTHON_SERVICE_DOWN',
                message: 'Python AI service is not running.',
                retryable: true,
            };
        }
        const res = await fetchPython('/gemini-image/verify', {}, Math.min(PYTHON_FETCH_TIMEOUT_MS, 20000));
        const data = await res.json().catch(() => ({}));
        return { ...data, httpStatus: res.status };
    } catch (error) {
        return {
            ok: false,
            configured: false,
            code: 'GEMINI_PYTHON_BRIDGE_ERROR',
            message: redactSecrets(error.message || String(error)),
            retryable: true,
        };
    }
}

async function generateGeminiFlashLiteImage(prompt) {
    await ensureServerRunning();
    if (!(await isServerHealthy())) {
        return {
            ok: false,
            retryable: true,
            status: 503,
            internalMessage: 'Python AI service is not running',
            code: 'PYTHON_SERVICE_DOWN',
            userMessage: null,
        };
    }
    const res = await fetchPython(
        '/gemini-image/generate',
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ prompt: String(prompt).slice(0, 4000) }),
        },
        GEMINI_IMAGE_TIMEOUT_MS,
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
        const msg = redactSecrets(data.message || `Gemini image HTTP ${res.status}`);
        let retryable = data.retryable !== false;
        let status = res.status >= 400 && res.status < 600 ? res.status : 502;
        const code = data.code || 'GEMINI_GENERATION_FAILED';
        if (status === 429) retryable = true;
        if (code === 'GEMINI_AUTH' || code === 'GEMINI_FORBIDDEN' || code === 'GEMINI_NOT_CONFIGURED') {
            retryable = false;
        }
        if (code === 'GEMINI_MODEL_UNAVAILABLE') retryable = false;
        return {
            ok: false,
            retryable,
            status,
            internalMessage: msg,
            code,
            userMessage: null,
        };
    }
    const b64 = data.image_base64;
    if (!b64 || typeof b64 !== 'string') {
        return {
            ok: false,
            retryable: true,
            status: 502,
            internalMessage: 'Gemini returned no image payload',
            code: 'GEMINI_NO_IMAGE',
            userMessage: null,
        };
    }
    const mimeType = data.mime_type || sniffImageMime(b64);
    const imageUrl = `data:${mimeType};base64,${b64.replace(/\s/g, '')}`;
    return {
        ok: true,
        imageUrl,
        mimeType,
        model: data.model,
        caption: data.caption,
    };
}

module.exports = {
    verifyGeminiImageAccess,
    generateGeminiFlashLiteImage,
    GEMINI_IMAGE_TIMEOUT_MS,
};
