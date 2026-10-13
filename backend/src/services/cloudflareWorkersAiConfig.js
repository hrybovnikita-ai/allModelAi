/**
 * Cloudflare Workers AI — account, API token, and OpenAI-compatible chat endpoint.
 * ChatGPT_API_KEY is treated as a Cloudflare API token when it is not an OpenAI sk- key.
 */

const DEFAULT_GPT_OSS_MODEL = '@cf/openai/gpt-oss-20b';

const strip = (value) => String(value || '').trim().replace(/^["']|["']$/g, '');

function isLikelyOpenAiSecretKey(token) {
    const key = strip(token);
    return Boolean(key && /^sk-/i.test(key));
}

function getCloudflareAccountId() {
    return strip(process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CF_ACCOUNT_ID);
}

/** Token candidates for Workers AI chat (includes ChatGPT_API_KEY per deployment convention). */
function getCloudflareWorkersAiToken() {
    const candidates = [
        process.env.CLOUDFLARE_API_TOKEN,
        process.env.CLOUDFLARE_API_KEY,
        process.env.CLAUDEFLARE_API_KEY,
        process.env.ChatGPT_API_KEY,
    ];
    for (const raw of candidates) {
        const token = strip(raw);
        if (token && !isLikelyOpenAiSecretKey(token)) return token;
    }
    return '';
}

function isCloudflareWorkersAiConfigured() {
    return Boolean(getCloudflareAccountId() && getCloudflareWorkersAiToken());
}

function normalizeWorkersAiModelId(model, fallback = DEFAULT_GPT_OSS_MODEL) {
    const cleaned = strip(model || fallback);
    if (!cleaned.startsWith('@cf/')) return fallback;
    return cleaned.replace(/[^\w@./-]/g, '') || fallback;
}

function resolveGptOssModelId(variantDirect) {
    const fromVariant = strip(variantDirect);
    if (fromVariant.startsWith('@cf/')) return normalizeWorkersAiModelId(fromVariant);
    const fromEnv = strip(
        process.env.CLOUDFLARE_GPT_OSS_MODEL
        || process.env.CLOUDFLARE_WORKERS_GPT_MODEL
        || process.env.CLOUDFLARE_MODEL,
    );
    if (fromEnv.startsWith('@cf/openai/gpt-oss')) return normalizeWorkersAiModelId(fromEnv);
    if (fromEnv.startsWith('@cf/')) return normalizeWorkersAiModelId(fromEnv, DEFAULT_GPT_OSS_MODEL);
    return DEFAULT_GPT_OSS_MODEL;
}

function buildCloudflareChatCompletionsUrl(accountId) {
    const account = strip(accountId || getCloudflareAccountId());
    return `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/ai/v1/chat/completions`;
}

/**
 * @returns {{ message: string, code: string, clientStatus: number, retryable: boolean }}
 */
function mapCloudflareChatHttpError(httpStatus, detailMessage = '') {
    const status = Number(httpStatus) || 0;
    const detail = String(detailMessage || '').toLowerCase();
    if (status === 401 || /unauthorized|invalid.*token|authentication/i.test(detail)) {
        return {
            message: 'Cloudflare Workers AI rejected the API token. Verify ChatGPT_API_KEY or CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID.',
            code: 'CLOUDFLARE_AUTH_FAILED',
            clientStatus: 401,
            retryable: false,
        };
    }
    if (status === 429 || /rate limit|too many requests/.test(detail)) {
        return {
            message: 'Cloudflare Workers AI is rate limited. Wait a moment and retry.',
            code: 'CLOUDFLARE_RATE_LIMITED',
            clientStatus: 429,
            retryable: true,
        };
    }
    if (status === 504 || /timeout|timed out|aborterror/.test(detail)) {
        return {
            message: 'Cloudflare Workers AI took too long to respond. Try again.',
            code: 'CLOUDFLARE_TIMEOUT',
            clientStatus: 504,
            retryable: true,
        };
    }
    if (status === 400 || status === 422) {
        return {
            message: 'Cloudflare Workers AI could not process this chat request.',
            code: 'CLOUDFLARE_INVALID_REQUEST',
            clientStatus: 400,
            retryable: false,
        };
    }
    if (status >= 500) {
        return {
            message: 'Cloudflare Workers AI is temporarily unavailable. Try again later.',
            code: 'CLOUDFLARE_UPSTREAM',
            clientStatus: 502,
            retryable: true,
        };
    }
    return {
        message: 'Cloudflare Workers AI could not complete this request.',
        code: 'CLOUDFLARE_CHAT_FAILED',
        clientStatus: status >= 400 && status < 600 ? status : 502,
        retryable: status >= 500,
    };
}

module.exports = {
    DEFAULT_GPT_OSS_MODEL,
    buildCloudflareChatCompletionsUrl,
    getCloudflareAccountId,
    getCloudflareWorkersAiToken,
    isCloudflareWorkersAiConfigured,
    isLikelyOpenAiSecretKey,
    mapCloudflareChatHttpError,
    normalizeWorkersAiModelId,
    resolveGptOssModelId,
};
