const path = require('path');
const dotenv = require('dotenv');
const OpenAI = require('openai');
const {
    DEEPSEEK_R1_FREE_MODEL,
    OPENROUTER_CHAT_COMPLETIONS_URL,
    OPENROUTER_DEEPSEEK_FREE_KEY_ENV,
    DEEPSEEK_FREE_OPENROUTER_KEY_LEGACY_ENV,
    resolveOpenRouterFreeRoute,
    mapOpenRouterFreeHttpError,
    missingOpenRouterFreeConfigPayload,
} = require('./openRouterFreeModels');

let dotenvLoaded = false;

function loadOpenRouterEnv() {
    if (dotenvLoaded || process.env.NODE_ENV === 'test') {
        return;
    }
    dotenvLoaded = true;
    dotenv.config({ path: path.resolve(__dirname, '../../.env'), override: false });
}

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const DEEPSEEK_FREE_MODEL = DEEPSEEK_R1_FREE_MODEL;

class DeepSeekChatError extends Error {
    constructor(status, message, code = 'DEEPSEEK_CHAT_FAILED') {
        super(message);
        this.name = 'DeepSeekChatError';
        this.status = status;
        this.code = code;
    }
}

function createOpenRouterClient(apiKey) {
    return new OpenAI({
        baseURL: OPENROUTER_BASE_URL,
        apiKey,
    });
}

let clientFactory = createOpenRouterClient;

function setOpenRouterClientFactoryForTests(factory) {
    clientFactory = factory || createOpenRouterClient;
}

function resetOpenRouterClientFactoryForTests() {
    clientFactory = createOpenRouterClient;
}

function mapSdkError(error) {
    const status = error?.status || error?.response?.status;
    const detail = error?.error?.message || error?.message || '';
    const mapped = mapOpenRouterFreeHttpError(status, detail);
    const code = error?.code || error?.cause?.code;
    if (
        code === 'ECONNREFUSED'
        || code === 'ENOTFOUND'
        || code === 'ETIMEDOUT'
        || code === 'UND_ERR_CONNECT_TIMEOUT'
        || error?.name === 'APIConnectionError'
    ) {
        return new DeepSeekChatError(503, mapped.message, 'OPENROUTER_FREE_NETWORK');
    }
    return new DeepSeekChatError(mapped.clientStatus, mapped.message, mapped.code);
}

async function chatWithDeepSeek(userMessage, options = {}) {
    const message = String(userMessage || '').trim();
    if (!message) {
        throw new DeepSeekChatError(400, 'message is required.', 'INVALID_REQUEST');
    }
    if (message.length > 16000) {
        throw new DeepSeekChatError(400, 'message is too long.', 'INVALID_REQUEST');
    }

    loadOpenRouterEnv();
    const route = resolveOpenRouterFreeRoute('deepseek-r1');
    if (!route) {
        const payload = missingOpenRouterFreeConfigPayload('deepseek-r1');
        throw new DeepSeekChatError(503, payload.message, payload.code);
    }

    const model = String(options.model || route.modelId).trim();
    const client = clientFactory(route.apiKey);

    try {
        const completion = await client.chat.completions.create({
            model,
            messages: [{ role: 'user', content: message }],
            max_tokens: Math.min(4096, Math.max(1, parseInt(options.maxTokens, 10) || 1024)),
        });
        const reply = completion.choices?.[0]?.message?.content;
        if (!reply || !String(reply).trim()) {
            throw new DeepSeekChatError(502, 'DeepSeek returned an empty response.', 'OPENROUTER_FREE_EMPTY');
        }
        return String(reply).trim();
    } catch (error) {
        if (error instanceof DeepSeekChatError) {
            throw error;
        }
        throw mapSdkError(error);
    }
}

function getDeepSeekFreeOpenRouterKey() {
    loadOpenRouterEnv();
    return resolveOpenRouterFreeRoute('deepseek-r1')?.apiKey || '';
}

function getDeepSeekFreeOpenRouterKeySourceEnvName() {
    loadOpenRouterEnv();
    const { getOpenRouterFreeKeySourceEnvName } = require('./openRouterFreeModels');
    return getOpenRouterFreeKeySourceEnvName('deepseek-r1');
}

module.exports = {
    chatWithDeepSeek,
    DeepSeekChatError,
    DEEPSEEK_FREE_MODEL,
    DEEPSEEK_FREE_OPENROUTER_KEY_ENV: OPENROUTER_DEEPSEEK_FREE_KEY_ENV,
    DEEPSEEK_FREE_OPENROUTER_KEY_LEGACY_ENV,
    OPENROUTER_BASE_URL,
    OPENROUTER_CHAT_COMPLETIONS_URL,
    getDeepSeekFreeOpenRouterKey,
    getDeepSeekFreeOpenRouterKeySourceEnvName,
    setOpenRouterClientFactoryForTests,
    resetOpenRouterClientFactoryForTests,
};
