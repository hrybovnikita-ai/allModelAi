const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const {
    validateMessageImages,
    findVisionRoutedModel,
    isVisionCapableSlug,
    resolveOpenAiVisionModel,
    mapUpstreamStatusForClient,
} = require('../src/services/visionSupport');

const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('visionSupport', () => {
    test('detects vision-capable slugs', () => {
        assert.equal(isVisionCapableSlug('gemini'), true);
        assert.equal(isVisionCapableSlug('cloudflare'), false);
        assert.equal(isVisionCapableSlug('claude'), true);
    });

    test('accepts small PNG data URLs', () => {
        const result = validateMessageImages([{ image: tinyPng }]);
        assert.equal(result.ok, true);
    });

    test('rejects unsupported formats', () => {
        const result = validateMessageImages([{ image: 'data:image/bmp;base64,QQ==' }]);
        assert.equal(result.ok, false);
        assert.equal(result.code, 'VISION_UNSUPPORTED_FORMAT');
    });

    test('OpenAI vision avoids non-multimodal OPENAI_MODEL values', () => {
        const prev = process.env.OPENAI_MODEL;
        process.env.OPENAI_MODEL = 'gpt-5.6-luna';
        delete process.env.OPENAI_VISION_MODEL;
        try {
            assert.equal(resolveOpenAiVisionModel(), 'gpt-4o-mini');
        } finally {
            if (prev === undefined) delete process.env.OPENAI_MODEL;
            else process.env.OPENAI_MODEL = prev;
        }
    });

    test('maps upstream 500 to client 502', () => {
        assert.equal(mapUpstreamStatusForClient(500), 502);
        assert.equal(mapUpstreamStatusForClient(401), 502);
    });

    test('findVisionRoutedModel prefers configured gemini', () => {
        const prev = process.env.GEMINI_API_KEY;
        process.env.GEMINI_API_KEY = 'x';
        try {
            assert.equal(findVisionRoutedModel('gemini', () => true), 'gemini');
        } finally {
            if (prev === undefined) delete process.env.GEMINI_API_KEY;
            else process.env.GEMINI_API_KEY = prev;
        }
    });
});
