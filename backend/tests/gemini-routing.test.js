const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.DB_FILE = path.join(os.tmpdir(), `allmodelai-gemini-route-${process.pid}-${Date.now()}.sqlite`);
process.env.DEVELOPER_EMAILS = 'gemini-route@example.com';
process.env.ENABLE_PLUS_TEST_MODE = 'true';
process.env.API_KEY = 'test-gateway-openrouter';

const app = require('../app');
const originalFetch = global.fetch;
const {
    mapOpenRouterBillingError,
} = require('../src/modelProviderEquivalence');
const {
    mapGeminiHttpError,
} = require('../src/services/geminiApiService');
const { shouldUseGoogleGeminiDirect } = require('../src/services/geminiModelRouting');

after(() => {
    global.fetch = originalFetch;
    app.locals.db.close();
});

test('shouldUseGoogleGeminiDirect when GEMINI_API_KEY is set', () => {
    const prev = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    try {
        assert.equal(shouldUseGoogleGeminiDirect('gemini'), true);
        assert.equal(shouldUseGoogleGeminiDirect('gpt'), false);
    } finally {
        if (prev === undefined) delete process.env.GEMINI_API_KEY;
        else process.env.GEMINI_API_KEY = prev;
    }
});

test('OpenRouter 402 vs Google quota errors are mapped differently', () => {
    const or = mapOpenRouterBillingError(402, 'This request requires more credits');
    assert.equal(or.code, 'OPENROUTER_INSUFFICIENT_CREDITS');
    assert.equal(or.clientStatus, 402);
    assert.match(or.message, /OpenRouter/i);

    const google = mapGeminiHttpError(429, 'Resource has been exhausted (quota)');
    assert.equal(google.clientStatus, 429);
    assert.match(google.message, /quota/i);
    assert.equal(google.errorClass, 'quota_exceeded');
    assert.equal(google.retryable, false);
    assert.equal(mapOpenRouterBillingError(429, 'Resource has been exhausted (quota)'), null);
});

test('gemini chat uses Google API directly and does not call OpenRouter on quota failure', async () => {
    const api = request.agent(app);
    await api.post('/api/auth/register').send({
        name: 'Gemini Route',
        email: 'gemini-route@example.com',
        password: 'test-password',
    });

    const prevGemini = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = 'test-gemini-key-local';

    const calledUrls = [];
    global.fetch = async (url) => {
        const href = String(url);
        calledUrls.push(href);
        if (href.includes('generativelanguage.googleapis.com')) {
            return new Response(JSON.stringify({
                error: { message: 'Resource has been exhausted (quota)' },
            }), { status: 429, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response(JSON.stringify({ error: { message: 'unexpected upstream' } }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    };

    try {
        const response = await api.post('/api/chat').send({
            model: 'gemini',
            variant: '3.5-flash-lite',
            temporary: true,
            messages: [{ role: 'user', text: 'Hello' }],
        });
        assert.equal(response.status, 429, JSON.stringify(response.body));
        assert.match(response.body.message, /quota/i);
        assert.equal(response.body.code, 'GEMINI_QUOTA_EXCEEDED');
        assert.equal(calledUrls.some((u) => u.includes('openrouter.ai')), false);
        assert.equal(calledUrls.filter((u) => u.includes('generativelanguage.googleapis.com')).length, 1);
        assert.match(calledUrls[0], /gemini-3\.5-flash-lite:streamGenerateContent/);
        assert.doesNotMatch(JSON.stringify(response.body), /test-gemini-key-local/);
    } finally {
        if (prevGemini === undefined) delete process.env.GEMINI_API_KEY;
        else process.env.GEMINI_API_KEY = prevGemini;
        global.fetch = originalFetch;
    }
});

test('gemini flash-lite success streams from Google when key is configured', async () => {
    const api = request.agent(app);
    await api.post('/api/auth/login').send({
        email: 'gemini-route@example.com',
        password: 'test-password',
    });

    const prevGemini = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = 'test-gemini-key-local';

    global.fetch = async (url) => {
        const href = String(url);
        assert.match(href, /generativelanguage\.googleapis\.com/);
        assert.match(href, /gemini-3\.5-flash-lite:streamGenerateContent/);
        const chunk = JSON.stringify({
            candidates: [{ content: { parts: [{ text: 'Hi from Google' }] } }],
        });
        return new Response(`data: ${chunk}\n\ndata: [DONE]\n\n`, { status: 200 });
    };

    try {
        const response = await api.post('/api/chat').send({
            model: 'gemini',
            variant: '3.5-flash-lite',
            temporary: true,
            messages: [{ role: 'user', text: 'Hello' }],
        });
        assert.equal(response.status, 200, response.text);
        assert.match(response.text, /Hi from Google/);
    } finally {
        if (prevGemini === undefined) delete process.env.GEMINI_API_KEY;
        else process.env.GEMINI_API_KEY = prevGemini;
        global.fetch = originalFetch;
    }
});

test('explicit gemini without GEMINI_API_KEY returns configure hint not OpenRouter 402', async () => {
    const api = request.agent(app);
    await api.post('/api/auth/login').send({
        email: 'gemini-route@example.com',
        password: 'test-password',
    });
    const prevGemini = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;

    global.fetch = async () => {
        throw new Error('fetch should not run when GEMINI_API_KEY is missing for model=gemini');
    };

    try {
        const response = await api.post('/api/chat').send({
            model: 'gemini',
            variant: '3.5-flash-lite',
            temporary: true,
            messages: [{ role: 'user', text: 'Hello' }],
        });
        assert.equal(response.status, 503);
        assert.equal(response.body.code, 'GEMINI_NOT_CONFIGURED');
        assert.match(response.body.message, /GEMINI_API_KEY/i);
    } finally {
        if (prevGemini === undefined) delete process.env.GEMINI_API_KEY;
        else process.env.GEMINI_API_KEY = prevGemini;
        global.fetch = originalFetch;
    }
});
