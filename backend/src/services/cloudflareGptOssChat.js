const {
    buildCloudflareChatCompletionsUrl,
    getCloudflareWorkersAiToken,
    isCloudflareWorkersAiConfigured,
    mapCloudflareChatHttpError,
    resolveGptOssModelId,
} = require('./cloudflareWorkersAiConfig');

class CloudflareGptOssChatError extends Error {
    constructor(message, { status = 502, code = 'CLOUDFLARE_CHAT_FAILED', retryable = false } = {}) {
        super(message);
        this.name = 'CloudflareGptOssChatError';
        this.status = status;
        this.code = code;
        this.retryable = retryable;
    }
}

function extractAssistantText(payload) {
    const choice = payload?.choices?.[0];
    if (choice?.message?.content != null) return String(choice.message.content);
    if (choice?.delta?.content != null) return String(choice.delta.content);
    const cfResult = payload?.result?.response;
    if (cfResult != null) return String(cfResult);
    return '';
}

/**
 * Non-streaming Workers AI chat (OpenAI-compatible). Used by tests and optional tooling.
 */
async function chatWithCloudflareGptOss(
    messages,
    {
        systemPrompt = '',
        maxTokens = 1024,
        modelId = null,
        fetchImpl = globalThis.fetch,
        signal = undefined,
    } = {},
) {
    if (!isCloudflareWorkersAiConfigured()) {
        throw new CloudflareGptOssChatError(
            'Cloudflare Workers AI is not configured. Set CLOUDFLARE_ACCOUNT_ID and ChatGPT_API_KEY (Cloudflare token).',
            { status: 503, code: 'CLOUDFLARE_NOT_CONFIGURED', retryable: false },
        );
    }
    const token = getCloudflareWorkersAiToken();
    const url = buildCloudflareChatCompletionsUrl();
    const body = {
        model: resolveGptOssModelId(modelId),
        stream: false,
        max_tokens: maxTokens,
        messages: [
            ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
            ...messages,
        ],
    };
    let response;
    try {
        response = await fetchImpl(url, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
            signal,
        });
    } catch (error) {
        const timedOut = signal?.aborted || error.name === 'TimeoutError' || /timed?\s*out/i.test(error.message);
        const mapped = mapCloudflareChatHttpError(timedOut ? 504 : 502, error.message);
        throw new CloudflareGptOssChatError(mapped.message, {
            status: mapped.clientStatus,
            code: mapped.code,
            retryable: mapped.retryable,
        });
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        const detail = data?.error?.message || data?.errors?.[0]?.message || JSON.stringify(data).slice(0, 200);
        const mapped = mapCloudflareChatHttpError(response.status, detail);
        throw new CloudflareGptOssChatError(mapped.message, {
            status: mapped.clientStatus,
            code: mapped.code,
            retryable: mapped.retryable,
        });
    }
    const text = extractAssistantText(data);
    if (!text) {
        throw new CloudflareGptOssChatError('Cloudflare Workers AI returned an empty response.', {
            status: 502,
            code: 'CLOUDFLARE_EMPTY_RESPONSE',
            retryable: true,
        });
    }
    return text;
}

module.exports = {
    CloudflareGptOssChatError,
    chatWithCloudflareGptOss,
    extractAssistantText,
};
