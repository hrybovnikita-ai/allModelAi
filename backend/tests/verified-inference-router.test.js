'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { shouldUseGroqDirect, stripGroqApiModelPrefix } = require('../src/services/groqChat');
const { verifiedBoostForSlug, recordVerifiedInference } = require('../src/services/verifiedInferenceHealth');

test('Groq uses direct API when key configured unless GROQ_USE_OPENROUTER=1', () => {
    process.env.GROQ_API_KEY = 'gsk_test_key_for_unit';
    delete process.env.GROQ_USE_OPENROUTER;
    process.env.GROQ_PROVIDER = 'openrouter';
    assert.equal(shouldUseGroqDirect('groq'), true);
    process.env.GROQ_USE_OPENROUTER = '1';
    assert.equal(shouldUseGroqDirect('groq'), false);
    delete process.env.GROQ_API_KEY;
    delete process.env.GROQ_USE_OPENROUTER;
});

test('stripGroqApiModelPrefix removes groq/ gateway prefix', () => {
    assert.equal(stripGroqApiModelPrefix('groq/llama-3.1-8b-instant'), 'llama-3.1-8b-instant');
});

test('verified inference adds router boost for slug', () => {
    recordVerifiedInference({ slug: 'nemotron', variantId: 'ultra', routeMode: 'openrouter', modelId: 'nvidia/nemotron-3-ultra-550b-a55b:free' });
    assert.ok(verifiedBoostForSlug('nemotron') >= 4);
});
