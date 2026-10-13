const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    buildCloudflareChatCompletionsUrl,
    getCloudflareWorkersAiToken,
    isCloudflareWorkersAiConfigured,
    mapCloudflareChatHttpError,
    resolveGptOssModelId,
} = require('../src/services/cloudflareWorkersAiConfig');
const {
    CloudflareGptOssChatError,
    chatWithCloudflareGptOss,
    extractAssistantText,
} = require('../src/services/cloudflareGptOssChat');
const { routedModelHasApiKey } = require('../src/chatProviderRuntime');

function saveEnv(keys) {
    const snapshot = {};
    for (const key of keys) {
        snapshot[key] = process.env[key];
    }
    return snapshot;
}

function restoreEnv(snapshot) {
    Object.entries(snapshot).forEach(([key, value]) => {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    });
}

test('Cloudflare Workers AI config resolves ChatGPT_API_KEY as token', () => {
    const prev = saveEnv(['ChatGPT_API_KEY', 'CLOUDFLARE_ACCOUNT_ID', 'OPENAI_API_KEY', 'CLOUDFLARE_API_KEY']);
    try {
        delete process.env.CLOUDFLARE_API_KEY;
        delete process.env.OPENAI_API_KEY;
        process.env.CLOUDFLARE_ACCOUNT_ID = 'acct-test-123';
        process.env.ChatGPT_API_KEY = 'cf-token-not-openai';
        assert.equal(isCloudflareWorkersAiConfigured(), true);
        assert.equal(getCloudflareWorkersAiToken(), 'cf-token-not-openai');
        assert.match(buildCloudflareChatCompletionsUrl(), /\/accounts\/acct-test-123\/ai\/v1\/chat\/completions$/);
        assert.equal(resolveGptOssModelId(), '@cf/openai/gpt-oss-20b');
    } finally {
        restoreEnv(prev);
    }
});

test('ChatGPT_API_KEY is ignored when it looks like an OpenAI sk- key', () => {
    const prev = saveEnv(['ChatGPT_API_KEY', 'CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN']);
    try {
        process.env.CLOUDFLARE_ACCOUNT_ID = 'acct-test-123';
        process.env.ChatGPT_API_KEY = 'sk-openai-should-not-be-used';
        delete process.env.CLOUDFLARE_API_TOKEN;
        assert.equal(getCloudflareWorkersAiToken(), '');
        assert.equal(isCloudflareWorkersAiConfigured(), false);
    } finally {
        restoreEnv(prev);
    }
});

test('gpt-oss slug does not use OpenRouter as API key fallback', () => {
    const prev = saveEnv(['OPENROUTER_API_KEY', 'ChatGPT_API_KEY', 'CLOUDFLARE_ACCOUNT_ID']);
    try {
        process.env.OPENROUTER_API_KEY = 'or-only';
        delete process.env.ChatGPT_API_KEY;
        delete process.env.CLOUDFLARE_ACCOUNT_ID;
        assert.equal(routedModelHasApiKey('gpt-oss'), false);
        process.env.CLOUDFLARE_ACCOUNT_ID = 'acct';
        process.env.ChatGPT_API_KEY = 'cf-token';
        assert.equal(routedModelHasApiKey('gpt-oss'), true);
        assert.equal(routedModelHasApiKey('gemini'), true);
    } finally {
        restoreEnv(prev);
    }
});

test('mapCloudflareChatHttpError covers auth, rate limit, and timeout', () => {
    assert.equal(mapCloudflareChatHttpError(401).code, 'CLOUDFLARE_AUTH_FAILED');
    assert.equal(mapCloudflareChatHttpError(429).clientStatus, 429);
    assert.equal(mapCloudflareChatHttpError(504).code, 'CLOUDFLARE_TIMEOUT');
});

test('chatWithCloudflareGptOss success and failure paths', async (t) => {
    const prev = saveEnv(['ChatGPT_API_KEY', 'CLOUDFLARE_ACCOUNT_ID']);
    process.env.CLOUDFLARE_ACCOUNT_ID = 'acct-test';
    process.env.ChatGPT_API_KEY = 'cf-token';

    await t.test('503 when not configured', async () => {
        delete process.env.CLOUDFLARE_ACCOUNT_ID;
        await assert.rejects(
            () => chatWithCloudflareGptOss([{ role: 'user', content: 'hi' }]),
            (err) => err instanceof CloudflareGptOssChatError && err.status === 503,
        );
        process.env.CLOUDFLARE_ACCOUNT_ID = 'acct-test';
    });

    await t.test('returns assistant text from OpenAI-shaped JSON', async () => {
        const fetchImpl = async () => ({
            ok: true,
            json: async () => ({
                choices: [{ message: { content: 'Hello from GPT-OSS' } }],
            }),
        });
        const reply = await chatWithCloudflareGptOss(
            [{ role: 'user', content: 'hello' }],
            { fetchImpl, systemPrompt: 'Be brief.' },
        );
        assert.equal(reply, 'Hello from GPT-OSS');
    });

    await t.test('maps HTTP 401', async () => {
        const fetchImpl = async () => ({
            ok: false,
            status: 401,
            json: async () => ({ error: { message: 'Unauthorized' } }),
        });
        await assert.rejects(
            () => chatWithCloudflareGptOss([{ role: 'user', content: 'hi' }], { fetchImpl }),
            (err) => err instanceof CloudflareGptOssChatError && err.status === 401,
        );
    });

    await t.test('maps HTTP 429', async () => {
        const fetchImpl = async () => ({
            ok: false,
            status: 429,
            json: async () => ({ error: { message: 'rate limit' } }),
        });
        await assert.rejects(
            () => chatWithCloudflareGptOss([{ role: 'user', content: 'hi' }], { fetchImpl }),
            (err) => err instanceof CloudflareGptOssChatError && err.status === 429,
        );
    });

    await t.test('maps network timeout', async () => {
        const fetchImpl = async () => {
            const err = new Error('The operation timed out');
            err.name = 'TimeoutError';
            throw err;
        };
        await assert.rejects(
            () => chatWithCloudflareGptOss([{ role: 'user', content: 'hi' }], { fetchImpl }),
            (err) => err instanceof CloudflareGptOssChatError && err.status === 504,
        );
    });

    t.after(() => restoreEnv(prev));
});

test('extractAssistantText supports OpenAI and legacy Cloudflare shapes', () => {
    assert.equal(extractAssistantText({ choices: [{ message: { content: 'A' } }] }), 'A');
    assert.equal(extractAssistantText({ result: { response: 'B' } }), 'B');
});
