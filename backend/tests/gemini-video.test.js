const test = require('node:test');
const assert = require('node:assert/strict');
const { generateVideo, getVideoGenerationStatus } = require('../src/videos');
const {
    parseImageInput,
    isGeminiVideoConfigured,
    GeminiVideoError,
} = require('../src/services/geminiVideoService');

const savedKey = process.env.GEMINI_API_KEY;
const savedMagic = process.env.MAGIC_HOUR_API_KEY;
const savedTypo = process.env.MAGIC_CHOUR_API_KEY;
const savedProvider = process.env.VIDEO_PROVIDER;

test.afterEach(() => {
    if (savedKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = savedKey;
    if (savedMagic === undefined) delete process.env.MAGIC_HOUR_API_KEY;
    else process.env.MAGIC_HOUR_API_KEY = savedMagic;
    if (savedTypo === undefined) delete process.env.MAGIC_CHOUR_API_KEY;
    else process.env.MAGIC_CHOUR_API_KEY = savedTypo;
    if (savedProvider === undefined) delete process.env.VIDEO_PROVIDER;
    else process.env.VIDEO_PROVIDER = savedProvider;
});

test('parseImageInput accepts data URLs', () => {
    const parsed = parseImageInput({ imageUrl: 'data:image/png;base64,abcd' });
    assert.equal(parsed.mimeType, 'image/png');
    assert.equal(parsed.imageBytes, 'abcd');
});

test('GET video status reflects active provider configuration', async () => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.MAGIC_HOUR_API_KEY;
    delete process.env.MAGIC_CHOUR_API_KEY;
    process.env.VIDEO_PROVIDER = 'gemini';
    const res = {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; },
    };
    await getVideoGenerationStatus({}, res);
    assert.equal(res.body.configured, false);

    process.env.GEMINI_API_KEY = 'test-key';
    await getVideoGenerationStatus({}, res);
    assert.equal(res.body.configured, true);
    assert.equal(res.body.activeProvider, 'gemini');
});

test('POST /api/videos returns 503 when no video provider is configured', async () => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.MAGIC_HOUR_API_KEY;
    delete process.env.MAGIC_CHOUR_API_KEY;
    process.env.VIDEO_PROVIDER = 'gemini';
    process.env.ENABLE_PLUS_TEST_MODE = 'true';
    const request = require('supertest');
    const app = require('../app');
    const agent = request.agent(app);
    const email = `gemini-video-${Date.now()}@example.com`;
    process.env.DEVELOPER_EMAILS = email;
    await agent.post('/api/auth/register').send({ name: 'Gemini Video', email, password: 'Password123!' });
    await agent.patch('/api/access-mode').send({ mode: 'developer' });
    const response = await agent.post('/api/videos').send({ prompt: 'A dragon flying over the city at dusk' });
    assert.equal(response.status, 503);
    assert.ok(['GEMINI_NOT_CONFIGURED', 'VIDEO_NOT_CONFIGURED'].includes(response.body.code));
});

test('POST /api/videos validates prompt length', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const res = {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; },
    };
    await generateVideo({
        app: require('../app'),
        user: { email: 'tester@example.com' },
        body: { prompt: '' },
    }, res);
    assert.equal(res.statusCode, 400);
});

test('GeminiVideoError carries status and code', () => {
    const err = new GeminiVideoError('fail', { status: 429, code: 'GEMINI_RATE_LIMIT', retryable: true });
    assert.equal(err.status, 429);
    assert.equal(err.code, 'GEMINI_RATE_LIMIT');
    assert.equal(isGeminiVideoConfigured(), Boolean(process.env.GEMINI_API_KEY?.trim()));
});
