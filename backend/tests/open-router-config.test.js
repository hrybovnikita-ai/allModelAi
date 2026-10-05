const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');
const {
    getOpenRouterApiKey,
    getOpenRouterKeySourceEnvName,
    isOpenRouterConfigured,
    OPENROUTER_KEY_ENV_NAMES,
} = require('../src/openRouterConfig');
const {
    isChatProviderConfigured,
    logAiProviderStatus,
    openRouterKey,
} = require('../src/chatProviderRuntime');
const { buildProviderSnapshot } = require('../src/providerHealth');

const ENV_NAMES = [...OPENROUTER_KEY_ENV_NAMES];

function saveOpenRouterEnv() {
    return Object.fromEntries(ENV_NAMES.map((name) => [name, process.env[name]]));
}

function restoreOpenRouterEnv(previous) {
    for (const name of ENV_NAMES) {
        if (previous[name] === undefined) delete process.env[name];
        else process.env[name] = previous[name];
    }
}

function clearOpenRouterEnv() {
    for (const name of ENV_NAMES) delete process.env[name];
}

test('ALLMODELAI_OPENROUTER_API_KEY alone configures OpenRouter', () => {
    const previous = saveOpenRouterEnv();
    clearOpenRouterEnv();
    process.env.ALLMODELAI_OPENROUTER_API_KEY = 'dedicated-only-key';
    try {
        assert.equal(getOpenRouterApiKey(), 'dedicated-only-key');
        assert.equal(isOpenRouterConfigured(), true);
        assert.equal(getOpenRouterKeySourceEnvName(), 'ALLMODELAI_OPENROUTER_API_KEY');
        assert.equal(isChatProviderConfigured('openrouter'), true);
        assert.equal(buildProviderSnapshot().openrouter.configured, true);
    } finally {
        restoreOpenRouterEnv(previous);
    }
});

test('ALLMODELAI_OPENROUTER_API_KEY has priority over OPENROUTER_API_KEY and API_KEY', () => {
    const previous = saveOpenRouterEnv();
    process.env.ALLMODELAI_OPENROUTER_API_KEY = 'priority-dedicated';
    process.env.OPENROUTER_API_KEY = 'legacy-openrouter';
    process.env.API_KEY = 'legacy-api-key';
    try {
        assert.equal(getOpenRouterApiKey(), 'priority-dedicated');
        assert.equal(openRouterKey(), 'priority-dedicated');
    } finally {
        restoreOpenRouterEnv(previous);
    }
});

test('OPENROUTER_API_KEY works when dedicated key is unset', () => {
    const previous = saveOpenRouterEnv();
    clearOpenRouterEnv();
    process.env.OPENROUTER_API_KEY = 'fallback-openrouter';
    try {
        assert.equal(getOpenRouterApiKey(), 'fallback-openrouter');
        assert.equal(getOpenRouterKeySourceEnvName(), 'OPENROUTER_API_KEY');
    } finally {
        restoreOpenRouterEnv(previous);
    }
});

test('API_KEY legacy alias works when other OpenRouter vars are unset', () => {
    const previous = saveOpenRouterEnv();
    clearOpenRouterEnv();
    process.env.API_KEY = 'legacy-gateway-key';
    try {
        assert.equal(getOpenRouterApiKey(), 'legacy-gateway-key');
        assert.equal(getOpenRouterKeySourceEnvName(), 'API_KEY');
    } finally {
        restoreOpenRouterEnv(previous);
    }
});

test('missing OpenRouter env vars report provider unavailable', () => {
    const previous = saveOpenRouterEnv();
    clearOpenRouterEnv();
    try {
        assert.equal(getOpenRouterApiKey(), '');
        assert.equal(isOpenRouterConfigured(), false);
        assert.equal(isChatProviderConfigured('openrouter'), false);
    } finally {
        restoreOpenRouterEnv(previous);
    }
});

test('logAiProviderStatus never prints secret values', () => {
    const previous = saveOpenRouterEnv();
    clearOpenRouterEnv();
    process.env.ALLMODELAI_OPENROUTER_API_KEY = 'sk-secret-must-not-log';
    const lines = [];
    const original = console.log;
    console.log = (...args) => lines.push(args.join(' '));
    try {
        logAiProviderStatus();
        const output = lines.join('\n');
        assert.match(output, /\[AI\] provider=openrouter configured=true/);
        assert.doesNotMatch(output, /sk-secret-must-not-log/);
        assert.doesNotMatch(output, /ALLMODELAI_OPENROUTER_API_KEY=/);
    } finally {
        console.log = original;
        restoreOpenRouterEnv(previous);
    }
});

test('chat uses ALLMODELAI_OPENROUTER_API_KEY alone and with priority over OPENROUTER_API_KEY', async () => {
    process.env.NODE_ENV = 'test';
    process.env.DB_FILE = path.join(os.tmpdir(), `allmodelai-or-dedicated-${process.pid}-${Date.now()}.sqlite`);
    process.env.DEVELOPER_EMAILS = 'dedicated-or@example.com';

    const previous = saveOpenRouterEnv();
    clearOpenRouterEnv();
    delete process.env.GEMINI_API_KEY;
    process.env.ALLMODELAI_OPENROUTER_API_KEY = 'dedicated-chat-key';
    process.env.OPENROUTER_API_KEY = 'legacy-openrouter-key';

    const originalFetch = global.fetch;
    let authHeader;
    global.fetch = async (url, options) => {
        if (String(url).includes('openrouter.ai')) {
            authHeader = options?.headers?.Authorization;
            const encoder = new TextEncoder();
            return new Response(new ReadableStream({
                start(controller) {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: 'Dedicated OK' } }] })}\n\n`));
                    controller.close();
                },
            }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
        }
        return new Response('{}', { status: 404 });
    };

    const app = require('../app');
    try {
        const agent = request.agent(app);
        await agent.post('/api/auth/register').send({
            name: 'Dedicated OR',
            email: 'dedicated-or@example.com',
            password: 'dedicated-or-password',
        });
        const response = await agent.post('/api/chat').send({
            model: 'gpt',
            temporary: true,
            messages: [{ role: 'user', text: 'hello' }],
        });
        assert.equal(response.status, 200, response.text?.slice?.(0, 200));
        assert.equal(authHeader, 'Bearer dedicated-chat-key');
        assert.doesNotMatch(String(authHeader), /legacy-openrouter-key/);
        assert.match(response.text, /Dedicated OK/);
    } finally {
        global.fetch = originalFetch;
        app.locals.db.close();
        restoreOpenRouterEnv(previous);
    }
});
