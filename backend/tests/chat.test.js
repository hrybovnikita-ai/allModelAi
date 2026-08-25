const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');

process.env.DB_FILE = path.join(os.tmpdir(), `allmodelai-chat-test-${process.pid}.json`);
process.env.API_KEY = 'test-api-key';
process.env.CLAUDE_API_KEY = 'test-claude-api-key';
fs.rmSync(process.env.DB_FILE, { force: true });

const app = require('../app');

const modelSlugs = [
    'gpt', 'gemini', 'claude', 'grok', 'copilot', 'perplexity',
    'kimi', 'deepseek', 'llama', 'mistral', 'qwen', 'cohere',
];

const createUpstreamResponse = (text = 'Mocked assistant response') => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        start(controller) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`));
            controller.close();
        },
    });
    return new Response(stream, { status: 200 });
};

const createClaudeResponse = (text = 'Mocked assistant response') => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        start(controller) {
            controller.enqueue(encoder.encode(`event: content_block_delta\ndata: ${JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text } })}\n\nevent: message_stop\ndata: ${JSON.stringify({ type: 'message_stop' })}\n\n`));
            controller.close();
        },
    });
    return new Response(stream, { status: 200 });
};

const createGeminiResponse = (text = 'Mocked assistant response') => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        start(controller) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] })}\n\n`));
            controller.close();
        },
    });
    return new Response(stream, { status: 200 });
};

describe('AllModelAI chat API', () => {
    let originalFetch;

    beforeEach(() => {
        originalFetch = global.fetch;
        const data = app.locals.db.read();
        data.conversations = [];
        data.subscriptions = { 'tester@example.com': 'common' };
        data.usage = { 'tester@example.com': 0 };
        app.locals.db.write(data);
    });

    afterEach(() => {
        global.fetch = originalFetch;
        process.env.API_KEY = 'test-api-key';
    });

    test('accepts every catalog model, streams a response, and saves history', async () => {
        const requestedModels = [];
        const requestedUrls = [];
        global.fetch = async (url, options) => {
            requestedUrls.push(url);
            const requestBody = JSON.parse(options.body);
            requestedModels.push(String(url).includes('generativelanguage.googleapis.com') ? 'gemini-2.5-flash' : requestBody.model);
            return url === 'https://api.anthropic.com/v1/messages'
                ? createClaudeResponse()
                : String(url).includes('generativelanguage.googleapis.com') ? createGeminiResponse() : createUpstreamResponse();
        };

        for (const model of modelSlugs) {
            const response = await request(app).post('/api/chat').send({
                model,
                userEmail: 'tester@example.com',
                messages: [{ role: 'user', text: `Hello ${model}` }],
            });

            assert.equal(response.status, 200);
            assert.match(response.text, /Mocked assistant response/);
        }

        assert.deepEqual(requestedModels, [
            'openai/gpt-4o-mini', 'google/gemini-2.5-flash', 'anthropic/claude-haiku-4.5',
            '~x-ai/grok-latest', 'openai/gpt-4o-mini', 'perplexity/sonar',
            '~moonshotai/kimi-latest', 'deepseek/deepseek-chat', 'meta-llama/llama-3.3-70b-instruct',
            'mistralai/mistral-small-3.1-24b-instruct', 'qwen/qwen-2.5-72b-instruct',
            'cohere/command-a',
        ]);
        assert.equal(requestedUrls[1], 'https://openrouter.ai/api/v1/chat/completions');
        assert.equal(requestedUrls[3], 'https://openrouter.ai/api/v1/chat/completions');
        assert.equal(requestedUrls[2], 'https://openrouter.ai/api/v1/chat/completions');
        assert.equal(requestedUrls[0], 'https://openrouter.ai/api/v1/chat/completions');

        const history = await request(app).get('/api/chat/history?email=tester@example.com');
        assert.equal(history.status, 200);
        assert.equal(history.body.length, modelSlugs.length);
        assert.equal(history.body[0].messages.at(-1).content, 'Mocked assistant response');
    });

    test('rejects an unsupported model before contacting the upstream API', async () => {
        let fetchCalled = false;
        global.fetch = async () => {
            fetchCalled = true;
            return createUpstreamResponse();
        };

        const response = await request(app).post('/api/chat').send({
            model: 'not-a-real-model',
            userEmail: 'tester@example.com',
            messages: [{ role: 'user', text: 'Hello' }],
        });

        assert.equal(response.status, 400);
        assert.equal(response.body.message, 'Unsupported AI model');
        assert.equal(fetchCalled, false);
    });

    test('rejects requests without an API key', async () => {
        delete process.env.API_KEY;

        const response = await request(app).post('/api/chat').send({
            model: 'gpt',
            userEmail: 'tester@example.com',
            messages: [{ role: 'user', text: 'Hello' }],
        });

        assert.equal(response.status, 503);
        assert.equal(response.body.message, 'The OpenRouter API key is not configured');
    });

    test('requires a user email and at least one message', async () => {
        const missingEmail = await request(app).post('/api/chat').send({
            model: 'gpt',
            messages: [{ role: 'user', text: 'Hello' }],
        });
        assert.equal(missingEmail.status, 400);
        assert.equal(missingEmail.body.message, 'User email is required');

        const missingMessages = await request(app).post('/api/chat').send({
            model: 'gpt',
            userEmail: 'tester@example.com',
            messages: [],
        });
        assert.equal(missingMessages.status, 400);
        assert.equal(missingMessages.body.message, 'At least one message is required');
    });
});
