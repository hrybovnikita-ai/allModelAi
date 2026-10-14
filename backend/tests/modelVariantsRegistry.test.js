const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const modelVariants = require('../src/data/modelVariants.json');

const SPEED = new Set(['Fast', 'Medium', 'High']);

describe('modelVariants registry', () => {
    test('every variant has gateway id and valid speed label', () => {
        for (const [slug, variants] of Object.entries(modelVariants)) {
            assert.ok(Array.isArray(variants) && variants.length, `missing variants for ${slug}`);
            for (const variant of variants) {
                assert.ok(variant.id, `${slug} variant missing id`);
                assert.ok(variant.gateway, `${slug}/${variant.id} missing gateway`);
                assert.ok(SPEED.has(variant.speed), `${slug}/${variant.id} invalid speed ${variant.speed}`);
            }
        }
    });

    test('Gemini variants use Google API ids (Flash-Lite, Flash, Pro)', () => {
        const gemini = modelVariants.gemini;
        assert.ok(gemini.some((v) => v.id === '3.1-pro' && v.direct === 'gemini-3.1-pro-preview'));
        assert.ok(gemini.some((v) => v.id === '3.5-flash-lite' && v.direct === 'gemini-3.5-flash-lite'));
        assert.ok(gemini.some((v) => v.id === '3-flash' && v.direct === 'gemini-3-flash-preview'));
        assert.ok(!gemini.some((v) => v.direct === 'gemini-3.5-flash'), 'removed unverified gemini-3.5-flash direct id');
    });

    test('DeepSeek variants map to current API model ids', () => {
        const deepseek = modelVariants.deepseek;
        assert.ok(deepseek.some((v) => v.id === 'flash' && v.direct === 'deepseek-flash'));
        assert.ok(deepseek.some((v) => v.id === 'pro' && v.direct === 'deepseek-v4-pro'));
    });

    test('perplexity sonar speed tiers map to distinct gateway ids', () => {
        const ids = modelVariants.perplexity.map((v) => v.gateway);
        assert.equal(new Set(ids).size, ids.length);
    });
});
