const { sanitizeEnvSecret } = require('../openRouterConfig');
const { sanitizeProviderHint } = require('./providerErrorClassification');

const GROQ_CHAT_COMPLETIONS_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODELS_URL = 'https://api.groq.com/openai/v1/models';
const DEFAULT_GROQ_MODEL = 'llama-3.3-70b-versatile';

/** Open-weight GPT-OSS 120B on GroqCloud — not OpenAI GPT-4.1 and not Cloudflare GPT-OSS. */
const GPT_OSS_GROQ_SLUG = 'gpt-oss-groq';
const GPT_OSS_GROQ_MODEL_ID = 'openai/gpt-oss-120b';
const GPT_OSS_GROQ_DISPLAY_NAME = 'GPT-OSS 120B — Groq';
const GPT_OSS_GROQ_PROVIDER_LABEL = 'GroqCloud';

function envTrim(name) {
    return sanitizeEnvSecret(process.env[name]);
}

function getGroqApiKey() {
    return envTrim('GROQ_API_KEY');
}

function isGroqConfigured() {
    return Boolean(getGroqApiKey());
}

function isGptOssGroqSlug(routedModel) {
    return String(routedModel || '').trim().toLowerCase() === GPT_OSS_GROQ_SLUG;
}

function isGroqFamilySlug(routedModel) {
    const slug = String(routedModel || '').trim().toLowerCase();
    return slug === 'groq' || slug === GPT_OSS_GROQ_SLUG;
}

/**
 * Direct GroqCloud path for Llama (groq) and GPT-OSS 120B (gpt-oss-groq).
 * Never uses OpenRouter when GROQ_PROVIDER=openrouter for gpt-oss-groq.
 */
function shouldUseGroqDirect(routedModel) {
    const slug = String(routedModel || '').trim().toLowerCase();
    if (!isGroqConfigured()) return false;
    if (slug === GPT_OSS_GROQ_SLUG) return true;
    if (slug !== 'groq') return false;
    if (envTrim('GROQ_PROVIDER') === 'openrouter') return false;
    return true;
}

function stripGroqApiModelPrefix(modelId) {
    const raw = String(modelId || '').trim();
    if (!raw) return '';
    if (raw.startsWith('groq/')) return raw.slice('groq/'.length);
    return raw;
}

function resolveGroqDirectModel(selectedVariant, routedModel = 'groq') {
    if (isGptOssGroqSlug(routedModel)) {
        if (selectedVariant?.direct) {
            const direct = stripGroqApiModelPrefix(selectedVariant.direct);
            if (direct === GPT_OSS_GROQ_MODEL_ID || direct.endsWith('gpt-oss-120b')) {
                return GPT_OSS_GROQ_MODEL_ID;
            }
        }
        return GPT_OSS_GROQ_MODEL_ID;
    }
    if (selectedVariant?.direct) {
        return stripGroqApiModelPrefix(selectedVariant.direct) || DEFAULT_GROQ_MODEL;
    }
    const gateway = String(selectedVariant?.gateway || '').trim();
    if (gateway.startsWith('groq/')) return gateway.slice('groq/'.length);
    const fromEnv = stripGroqApiModelPrefix(envTrim('GROQ_MODEL'));
    return fromEnv || DEFAULT_GROQ_MODEL;
}

/** OpenRouter / gateway ids use the groq/ prefix; GroqCloud direct API does not. */
function resolveGroqOpenRouterGateway(selectedVariant) {
    const gateway = String(selectedVariant?.gateway || '').trim();
    if (gateway) return gateway;
    const direct = stripGroqApiModelPrefix(selectedVariant?.direct || envTrim('GROQ_MODEL') || DEFAULT_GROQ_MODEL);
    return direct.startsWith('groq/') ? direct : `groq/${direct}`;
}

function mapGroqHttpError(status, detail = '') {
    const text = sanitizeProviderHint(detail, 240) || String(detail || '').trim();
    const lower = text.toLowerCase();
    const code = Number(status) || 0;

    if (code === 401 || code === 403) {
        return {
            code: 'GROQ_AUTH_FAILED',
            clientStatus: 502,
            provider: 'groq',
            message: 'Groq rejected the server API key. Verify GROQ_API_KEY on the backend and redeploy.',
        };
    }
    if (code === 402 || /insufficient.?quota|quota.?exceeded|free.?tier|out of credits|billing|payment required/i.test(lower)) {
        return {
            code: 'GROQ_QUOTA_EXHAUSTED',
            clientStatus: 402,
            provider: 'groq',
            message: 'Groq reports insufficient quota or free-tier allowance for this account. Wait for the quota reset or choose another configured model.',
        };
    }
    if (code === 429) {
        const quota = /insufficient.?quota|quota.?exceeded|free.?tier|credits|billing/i.test(lower);
        if (quota) {
            return {
                code: 'GROQ_QUOTA_EXHAUSTED',
                clientStatus: 402,
                provider: 'groq',
                message: 'Groq free-tier quota is exhausted. Wait for the reset or choose another configured model.',
            };
        }
        return {
            code: 'GROQ_RATE_LIMITED',
            clientStatus: 429,
            provider: 'groq',
            message: 'Groq rate limit reached. Wait a moment and retry, or choose another model.',
        };
    }
    if (code === 400 || code === 422) {
        if (/not a valid model|model.*not found|does not exist|unknown model/i.test(lower)) {
            return {
                code: 'GROQ_MODEL_NOT_FOUND',
                clientStatus: 502,
                provider: 'groq',
                message: 'The selected Groq model id is invalid for api.groq.com. Use the bare id (for example llama-3.3-70b-versatile), not a groq/ OpenRouter prefix.',
            };
        }
        return {
            code: 'GROQ_INVALID_REQUEST',
            clientStatus: 400,
            provider: 'groq',
            message: text || 'Groq could not process this request. Check the selected model version.',
        };
    }
    if (code === 404) {
        return {
            code: 'GROQ_MODEL_NOT_FOUND',
            clientStatus: 502,
            provider: 'groq',
            message: 'The selected Groq model is not available. Pick another Groq version or update the model id.',
        };
    }
    if (code >= 500) {
        return {
            code: 'GROQ_UPSTREAM',
            clientStatus: 502,
            provider: 'groq',
            message: 'Groq is temporarily unavailable. Retry in a few seconds.',
        };
    }
    if (code > 0) {
        return {
            code: 'GROQ_UPSTREAM',
            clientStatus: code >= 400 && code < 600 ? code : 502,
            provider: 'groq',
            message: text || 'Groq could not complete this request.',
        };
    }
    return null;
}

const GPT_OSS_PROBE_TTL_MS = Number(process.env.GROQ_GPT_OSS_PROBE_TTL_MS) || 120_000;

/** @type {{ value: object | null, expiresAt: number }} */
let gptOssLiveProbeCache = { value: null, expiresAt: 0 };

/**
 * Real chat-completions probe for GPT-OSS 120B on GroqCloud (non-streaming, minimal tokens).
 * Never logs or returns the API key.
 */
async function probeGptOssGroqAvailability({ timeoutMs = 12_000 } = {}) {
    const key = getGroqApiKey();
    if (!key) {
        return { ok: false, status: 'missing_configuration' };
    }
    try {
        const response = await fetch(GROQ_CHAT_COMPLETIONS_URL, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${key}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: GPT_OSS_GROQ_MODEL_ID,
                messages: [{ role: 'user', content: 'Reply with one short word.' }],
                max_tokens: 12,
                stream: false,
            }),
            signal: AbortSignal.timeout(timeoutMs),
        });
        const data = await response.json().catch(() => ({}));
        const detail = data?.error?.message || data?.message || '';

        if (response.status === 401 || response.status === 403) {
            return { ok: false, status: 'authentication_failed', httpStatus: response.status };
        }
        if (response.status === 404) {
            return { ok: false, status: 'model_not_found', httpStatus: response.status };
        }
        if (response.status === 429) {
            const mapped = mapGroqHttpError(429, detail);
            return {
                ok: false,
                status: mapped?.code === 'GROQ_QUOTA_EXHAUSTED' ? 'quota_exhausted' : 'rate_limited',
                httpStatus: 429,
            };
        }
        if (!response.ok) {
            return {
                ok: false,
                status: 'upstream_error',
                httpStatus: response.status,
            };
        }
        const text = data?.choices?.[0]?.message?.content;
        if (!String(text || '').trim()) {
            return { ok: false, status: 'empty_response', httpStatus: response.status };
        }
        return { ok: true, status: 'ok', httpStatus: response.status };
    } catch (error) {
        return { ok: false, status: 'network_error', message: error.message };
    }
}

async function warmGptOssGroqLiveProbe() {
    const result = await probeGptOssGroqAvailability();
    const value = { ...result, checkedAt: new Date().toISOString() };
    gptOssLiveProbeCache = { value, expiresAt: Date.now() + GPT_OSS_PROBE_TTL_MS };
    return value;
}

function getCachedGptOssGroqLiveStatus() {
    if (!isGroqConfigured()) {
        return { ok: false, status: 'missing_configuration', checkedAt: null };
    }
    if (gptOssLiveProbeCache.value && gptOssLiveProbeCache.expiresAt > Date.now()) {
        return gptOssLiveProbeCache.value;
    }
    return { ok: null, status: 'not_checked', checkedAt: null };
}

/** @internal Tests only */
function resetGptOssGroqProbeCacheForTests() {
    gptOssLiveProbeCache = { value: null, expiresAt: 0 };
}

function resolveGptOssGroqLibraryHealth() {
    const configured = isGroqConfigured();
    if (!configured) {
        return {
            configured: false,
            available: false,
            status: 'setup_needed',
            probe: 'missing_configuration',
            modelId: GPT_OSS_GROQ_MODEL_ID,
            endpoint: GROQ_CHAT_COMPLETIONS_URL,
            requiredEnv: ['GROQ_API_KEY'],
            checkedAt: null,
        };
    }
    const live = getCachedGptOssGroqLiveStatus();
    if (live.ok === true) {
        return {
            configured: true,
            available: true,
            status: 'available',
            probe: live.status,
            modelId: GPT_OSS_GROQ_MODEL_ID,
            endpoint: GROQ_CHAT_COMPLETIONS_URL,
            requiredEnv: ['GROQ_API_KEY'],
            checkedAt: live.checkedAt || null,
        };
    }
    if (live.ok === false && live.status !== 'not_checked') {
        return {
            configured: true,
            available: false,
            status: 'unavailable',
            probe: live.status,
            modelId: GPT_OSS_GROQ_MODEL_ID,
            endpoint: GROQ_CHAT_COMPLETIONS_URL,
            requiredEnv: ['GROQ_API_KEY'],
            checkedAt: live.checkedAt || null,
        };
    }
    return {
        configured: true,
        available: false,
        status: 'configured',
        probe: live.status || 'not_checked',
        modelId: GPT_OSS_GROQ_MODEL_ID,
        endpoint: GROQ_CHAT_COMPLETIONS_URL,
        requiredEnv: ['GROQ_API_KEY'],
        checkedAt: live.checkedAt || null,
    };
}

function logGroqHttpError(status, responseData, context = {}) {
    const detail = sanitizeProviderHint(
        responseData?.error?.message || responseData?.message || '',
        200,
    );
    console.error('[GROQ ERROR]', {
        status: Number(status) || 0,
        message: detail || '(no upstream message)',
        model: context.model || null,
        routedModel: context.routedModel || null,
        correlationId: context.correlationId || null,
    });
}

module.exports = {
    DEFAULT_GROQ_MODEL,
    GPT_OSS_GROQ_DISPLAY_NAME,
    GPT_OSS_GROQ_MODEL_ID,
    GPT_OSS_GROQ_PROVIDER_LABEL,
    GPT_OSS_GROQ_SLUG,
    GROQ_CHAT_COMPLETIONS_URL,
    GROQ_MODELS_URL,
    getGroqApiKey,
    isGptOssGroqSlug,
    isGroqConfigured,
    isGroqFamilySlug,
    logGroqHttpError,
    mapGroqHttpError,
    resolveGroqDirectModel,
    resolveGroqOpenRouterGateway,
    stripGroqApiModelPrefix,
    resolveGptOssGroqLibraryHealth,
    getCachedGptOssGroqLiveStatus,
    probeGptOssGroqAvailability,
    resetGptOssGroqProbeCacheForTests,
    warmGptOssGroqLiveProbe,
    shouldUseGroqDirect,
};
