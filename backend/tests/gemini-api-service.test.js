const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    mapGeminiHttpError,
    normalizeModelId,
    supportsGenerateContent,
} = require('../src/services/geminiApiService');
const { resolveGeminiDirectModel, DEFAULT_GEMINI_TEXT_MODEL } = require('../src/services/geminiModelRouting');

test('normalizeModelId strips models/ prefix', () => {
    assert.equal(normalizeModelId('models/gemini-3.5-flash-lite'), 'gemini-3.5-flash-lite');
});

test('working Gemini variants keep verified direct ids', () => {
    const variants = require('../src/data/modelVariants.json').gemini;
    const lite = variants.find((v) => v.id === '3.5-flash-lite');
    const flash = variants.find((v) => v.id === '3-flash');
    assert.equal(lite.direct, 'gemini-3.5-flash-lite');
    assert.equal(flash.direct, 'gemini-3-flash-preview');
    assert.equal(resolveGeminiDirectModel({ selectedVariant: lite }), 'gemini-3.5-flash-lite');
    assert.equal(resolveGeminiDirectModel({ selectedVariant: flash }), 'gemini-3-flash-preview');
});

test('Gemini 3.1 ids stay exact and are not rewritten to 3.5', () => {
    const variants = require('../src/data/modelVariants.json').gemini;
    const lite = variants.find((v) => v.id === '3.1-flash-lite');
    const pro = variants.find((v) => v.id === '3.1-pro');
    assert.equal(resolveGeminiDirectModel({ selectedVariant: lite }), 'gemini-3.1-flash-lite');
    assert.equal(resolveGeminiDirectModel({ selectedVariant: pro }), 'gemini-3.1-pro-preview');
});

test('Gemini 429 quota is not treated as a retryable rate limit', () => {
    const mapped = mapGeminiHttpError(429, 'You exceeded your current quota, please check your plan and billing details.');
    assert.equal(mapped.errorClass, 'quota_exceeded');
    assert.equal(mapped.retryable, false);
});

test('Gemini 503 high demand stays temporarily unavailable', () => {
    const mapped = mapGeminiHttpError(503, 'This model is currently experiencing high demand.');
    assert.equal(mapped.errorClass, 'server_error');
    assert.match(mapped.message, /high demand/i);
});

test('supportsGenerateContent checks method list', () => {
    assert.equal(supportsGenerateContent({ supportedGenerationMethods: ['generateContent'] }), true);
    assert.equal(supportsGenerateContent({ supportedGenerationMethods: ['embedContent'] }), false);
});

test('resolveGeminiDirectModel defaults to verified flash-lite', () => {
    const prev = process.env.GEMINI_MODEL;
    delete process.env.GEMINI_MODEL;
    try {
        assert.equal(resolveGeminiDirectModel({ hasImages: false }), DEFAULT_GEMINI_TEXT_MODEL);
    } finally {
        if (prev === undefined) delete process.env.GEMINI_MODEL;
        else process.env.GEMINI_MODEL = prev;
    }
});
