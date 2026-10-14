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

test('mapGeminiHttpError maps auth, quota, and not found', () => {
    assert.equal(mapGeminiHttpError(401).errorClass, 'authentication_failed');
    assert.equal(mapGeminiHttpError(403).clientStatus, 403);
    assert.equal(mapGeminiHttpError(404).errorClass, 'model_not_found');
    assert.equal(mapGeminiHttpError(429).retryable, true);
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
