const test = require('node:test');
const assert = require('node:assert/strict');
const { generateVideo, getVideoGenerationStatus } = require('../src/videos');
const {
    parseImageInput,
    isGeminiVideoConfigured,
    GeminiVideoError,
} = require('../src/services/geminiVideoService');

const savedKey = process.env.GEMINI_API_KEY;

test.afterEach(() => {
    if (savedKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = savedKey;
});

test('parseImageInput accepts data URLs', () => {
    const parsed = parseImageInput({ imageUrl: 'data:image/png;base64,abcd' });
    assert.equal(parsed.mimeType, 'image/png');
    assert.equal(parsed.imageBytes, 'abcd');
});

test('GET video status reflects GEMINI_API_KEY', async () => {
    delete process.env.GEMINI_API_KEY;
    const res = {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; },
    };
    getVideoGenerationStatus({}, res);
    assert.equal(res.body.configured, false);

    process.env.GEMINI_API_KEY = 'test-key';
    getVideoGenerationStatus({}, res);
    assert.equal(res.body.configured, true);
    assert.equal(res.body.provider, 'google-veo');
});

test('POST /api/videos returns 503 when GEMINI_API_KEY is missing', async () => {
    delete process.env.GEMINI_API_KEY;
    const res = {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; },
    };
    await generateVideo({ body: { prompt: 'A dragon flying over the city at dusk' } }, res);
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.code, 'GEMINI_NOT_CONFIGURED');
    assert.ok(res.body.missingEnvVars.includes('GEMINI_API_KEY'));
});

test('POST /api/videos validates prompt length', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const res = {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; },
    };
    await generateVideo({ body: { prompt: '' } }, res);
    assert.equal(res.statusCode, 400);
});

test('GeminiVideoError carries status and code', () => {
    const err = new GeminiVideoError('fail', { status: 429, code: 'GEMINI_RATE_LIMIT', retryable: true });
    assert.equal(err.status, 429);
    assert.equal(err.code, 'GEMINI_RATE_LIMIT');
    assert.equal(isGeminiVideoConfigured(), Boolean(process.env.GEMINI_API_KEY?.trim()));
});
