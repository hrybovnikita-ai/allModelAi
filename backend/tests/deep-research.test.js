const { describe, test, before, after, mock } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.DEVELOPER_EMAILS = 'researcher@example.com';
process.env.DB_FILE = path.join(os.tmpdir(), `allmodelai-deep-research-${process.pid}.sqlite`);
process.env.API_KEY = 'test-key';
process.env.GEMINI_API_KEY = 'test-gemini';
fs.rmSync(process.env.DB_FILE, { force: true });

const app = require('../app');
const { dedupeByUrl, normalizeDepth } = require('../src/services/deepResearchService');

let api;
let originalFetch;

const sseUpstream = (chunks) => {
    const encoder = new TextEncoder();
    const body = chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join('') + 'data: [DONE]\n\n';
    return new Response(new ReadableStream({
        start(controller) {
            controller.enqueue(encoder.encode(body));
            controller.close();
        },
    }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
};

describe('Deep Research API', () => {
    before(async () => {
        api = request.agent(app);
        await api.post('/api/auth/register').send({
            name: 'Researcher',
            email: 'researcher@example.com',
            password: 'secret',
        });
        originalFetch = global.fetch;
    });

    after(() => {
        global.fetch = originalFetch;
        app.locals.db.close();
    });

    test('rejects unauthenticated research requests', async () => {
        const response = await request(app).post('/api/research').send({ query: 'test', depth: 'quick' });
        assert.equal(response.status, 401);
    });

    test('rejects empty query', async () => {
        const response = await api.post('/api/research').send({ query: '  ', depth: 'quick' });
        assert.equal(response.status, 400);
    });

    test('returns 503 when Tavily key is missing for deep mode', async () => {
        const previous = process.env.TAVILY_API_KEY;
        delete process.env.TAVILY_API_KEY;
        try {
            const response = await api.post('/api/research').send({ query: 'quantum computing trends', depth: 'quick' });
            assert.equal(response.status, 503);
            assert.equal(response.body.code, 'tavily_not_configured');
        } finally {
            if (previous) process.env.TAVILY_API_KEY = previous;
        }
    });

    test('maps Tavily auth errors safely', async () => {
        process.env.TAVILY_API_KEY = 'bad-key';
        global.fetch = async (url) => {
            if (String(url).includes('tavily.com')) {
                return new Response(JSON.stringify({ detail: 'Unauthorized: invalid api key' }), { status: 401 });
            }
            return sseUpstream([{ candidates: [{ content: { parts: [{ text: '{"objective":"x","queries":["a","b"]}' }] } }] }]);
        };
        const response = await api.post('/api/research').send({ query: 'AI safety report', depth: 'quick' });
        assert.equal(response.status, 401);
        assert.equal(response.body.code, 'tavily_auth');
        assert.doesNotMatch(JSON.stringify(response.body), /bad-key/);
    });

    test('collects Tavily sources with mocked API', async () => {
        process.env.TAVILY_API_KEY = 'tvly-test';
        global.fetch = async (url, options) => {
            if (String(url).includes('tavily.com/search')) {
                const body = JSON.parse(options.body);
                assert.ok(body.api_key);
                assert.equal(body.api_key, 'tvly-test');
                return new Response(JSON.stringify({
                    results: [
                        { title: 'Official Docs', url: 'https://docs.example.com/guide', content: 'Primary documentation', score: 0.9 },
                        { title: 'Duplicate', url: 'https://docs.example.com/guide', content: 'dup', score: 0.5 },
                    ],
                }), { status: 200 });
            }
            return new Response(JSON.stringify({
                candidates: [{ content: { parts: [{ text: '{"objective":"Study docs","queries":["example docs","example official"]}' }] } }],
            }), { status: 200 });
        };

        const response = await api.post('/api/research').send({ query: 'example documentation', depth: 'quick' });
        assert.equal(response.status, 200);
        assert.ok(response.body.sources.length >= 1);
        assert.equal(response.body.sources[0].url, 'https://docs.example.com/guide');
    });

    test('streams deep research answer with stages', async () => {
        process.env.TAVILY_API_KEY = 'tvly-test';
        global.fetch = async (url, options) => {
            if (String(url).includes('tavily.com/search')) {
                return new Response(JSON.stringify({
                    results: [{ title: 'Reuters', url: 'https://reuters.com/article', content: 'Market update', score: 0.88 }],
                }), { status: 200 });
            }
            if (String(url).includes('openrouter.ai')) {
                return sseUpstream([{ choices: [{ delta: { content: '## Deep Research\n\nOverview text [1]' } }] }]);
            }
            if (String(url).includes('generativelanguage.googleapis.com')) {
                const text = options?.body ? JSON.parse(options.body).contents?.[0]?.parts?.[0]?.text : '';
                if (text.includes('Return JSON')) {
                    return new Response(JSON.stringify({
                        candidates: [{ content: { parts: [{ text: '{"objective":"o","queries":["q1","q2"]}' }] } }],
                    }), { status: 200 });
                }
                return sseUpstream([{ candidates: [{ content: { parts: [{ text: 'Report [1]' }] } }] }]);
            }
            return new Response('{}', { status: 200 });
        };

        const response = await api.post('/api/research/answer').send({
            query: 'market outlook',
            depth: 'quick',
            deepResearch: true,
            model: 'gemini',
        });
        assert.equal(response.status, 200);
        assert.match(response.text, /deepResearchStage|"planning"/);
        assert.match(response.text, /webSources/);
    });

    test('dedupes duplicate source URLs', () => {
        const merged = dedupeByUrl([
            { url: 'https://a.com/x', score: 1, title: 'A' },
            { url: 'https://a.com/x', score: 3, title: 'A2' },
            { url: 'https://b.com/y', score: 2, title: 'B' },
        ]);
        assert.equal(merged.length, 2);
        assert.equal(merged.find((s) => s.url.includes('a.com')).score, 3);
    });

    test('normalizes depth aliases', () => {
        assert.equal(normalizeDepth('max'), 'maximum');
        assert.equal(normalizeDepth('fast'), 'quick');
        assert.equal(normalizeDepth('deep'), 'deep');
    });
});
