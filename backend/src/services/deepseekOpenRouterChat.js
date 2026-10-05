const path = require('path');
const dotenv = require('dotenv');
const OpenAI = require('openai');

let dotenvLoaded = false;

function loadOpenRouterEnv() {
    if (dotenvLoaded || process.env.NODE_ENV === 'test') {
        return;
    }
    dotenvLoaded = true;
    dotenv.config({ path: path.resolve(__dirname, '../../.env'), override: false });
}

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const DEEPSEEK_FREE_MODEL = 'deepseek/deepseek-v4-flash:free';

class DeepSeekChatError extends Error {
    constructor(status, message) {
        super(message);
        this.name = 'DeepSeekChatError';
        this.status = status;
    }
}

function getOpenRouterKeyFromEnv() {
    loadOpenRouterEnv();
    return String(process.env.OPENROUTER_API_KEY || '').trim();
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
    if (status === 401) {
        return new DeepSeekChatError(401, 'OpenRouter authentication failed. Check OPENROUTER_API_KEY in backend/.env.');
    }
    if (status === 429) {
        return new DeepSeekChatError(429, 'OpenRouter rate limit exceeded. Wait and try again.');
    }
    const code = error?.code || error?.cause?.code;
    if (
        code === 'ECONNREFUSED'
        || code === 'ENOTFOUND'
        || code === 'ETIMEDOUT'
        || code === 'UND_ERR_CONNECT_TIMEOUT'
        || error?.name === 'APIConnectionError'
    ) {
        return new DeepSeekChatError(503, 'Network error while contacting OpenRouter. Check your connection and try again.');
    }
    const message = error?.error?.message || error?.message || 'DeepSeek request failed.';
    return new DeepSeekChatError(status && status >= 400 && status < 600 ? status : 502, message);
}

async function chatWithDeepSeek(userMessage, options = {}) {
    const message = String(userMessage || '').trim();
    if (!message) {
        throw new DeepSeekChatError(400, 'message is required.');
    }
    if (message.length > 16000) {
        throw new DeepSeekChatError(400, 'message is too long.');
    }

    const apiKey = getOpenRouterKeyFromEnv();
    if (!apiKey) {
        throw new DeepSeekChatError(
            503,
            'OPENROUTER_API_KEY is not configured. Add it to backend/.env and restart the server.',
        );
    }

    const model = String(options.model || DEEPSEEK_FREE_MODEL).trim();
    const client = clientFactory(apiKey);

    try {
        const completion = await client.chat.completions.create({
            model,
            messages: [{ role: 'user', content: message }],
            max_tokens: Math.min(4096, Math.max(1, parseInt(options.maxTokens, 10) || 1024)),
        });
        const reply = completion.choices?.[0]?.message?.content;
        if (!reply || !String(reply).trim()) {
            throw new DeepSeekChatError(502, 'DeepSeek returned an empty response.');
        }
        return String(reply).trim();
    } catch (error) {
        if (error instanceof DeepSeekChatError) {
            throw error;
        }
        throw mapSdkError(error);
    }
}

module.exports = {
    chatWithDeepSeek,
    DeepSeekChatError,
    DEEPSEEK_FREE_MODEL,
    OPENROUTER_BASE_URL,
    setOpenRouterClientFactoryForTests,
    resetOpenRouterClientFactoryForTests,
};
