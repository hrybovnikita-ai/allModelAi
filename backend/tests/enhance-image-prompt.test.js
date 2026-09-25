const { test } = require('node:test');
const assert = require('node:assert/strict');
const { enhanceImagePrompt, buildImagePromptPayload } = require('../src/enhanceImagePrompt');

test('strips generation prefixes and preserves core subjects in enhanced prompt', () => {
    const result = enhanceImagePrompt({
        prompt: 'Сгенерируй изображение золотого дракона с фиолетовыми молниями на чёрном фоне',
        style: 'cinematic',
        aspectRatio: '16:9',
        quality: 'high',
    });

    assert.match(result.userPrompt, /золотого дракона/i);
    assert.match(result.enhancedPrompt, /золотого дракона/i);
    assert.match(result.enhancedPrompt, /golden dragon/i);
    assert.match(result.enhancedPrompt, /purple/i);
    assert.match(result.enhancedPrompt, /black background/i);
    assert.match(result.enhancedPrompt, /cinematic composition/i);
    assert.doesNotMatch(result.enhancedPrompt, /photorealistic/i);
    assert.equal(result.quality, 'hd');
    assert.equal(result.aspectRatio, '16:9');
});

test('draw me prefix and narysuy mne preserve gold dragon scene', () => {
    const result = enhanceImagePrompt({
        prompt: 'нарисуй мне золотого дракона с фиолетовыми молниями на чёрном фоне',
        quality: 'high',
    });

    assert.match(result.userPrompt, /золотого дракона/i);
    assert.match(result.enhancedPrompt, /золотого дракона/i);
    assert.match(result.enhancedPrompt, /golden dragon/i);
    assert.match(result.enhancedPrompt, /purple/i);
    assert.match(result.enhancedPrompt, /black background/i);
    assert.match(result.enhancedPrompt, /highly detailed, sharp focus/i);
});

test('keeps an english prompt intact and appends quality direction', () => {
    const prompt = 'golden dragon with purple lightning on a black background';
    const result = enhanceImagePrompt({ prompt, quality: 'ultra' });
    assert.ok(result.enhancedPrompt.startsWith(prompt));
    assert.match(result.enhancedPrompt, /ultra detailed, tack-sharp focus/i);
    assert.doesNotMatch(result.enhancedPrompt, /photorealistic/i);
});

test('a photorealistic style selection does not override an anime request', () => {
    const result = enhanceImagePrompt({
        prompt: 'anime fox in the rain',
        style: 'photorealistic',
        quality: 'ultra',
    });
    assert.match(result.enhancedPrompt, /anime/i);
    assert.doesNotMatch(result.enhancedPrompt, /photorealistic/i);
});

test('does not force photorealism onto anime, illustration, 3d, logo, or pixel art', () => {
    const prompts = [
        'anime cat warrior',
        'watercolor illustration of a fox',
        '3d render of a helmet',
        'pixel art sword',
        'minimal logo for a cafe',
    ];
    for (const prompt of prompts) {
        const result = enhanceImagePrompt({ prompt, quality: 'ultra', style: 'auto' });
        assert.equal(result.enhancedPrompt.includes(prompt), true);
        assert.doesNotMatch(result.enhancedPrompt, /photorealistic/i);
    }
});

test('edit instruction merges with base prompt without dropping anchors', () => {
    const base = 'golden dragon with purple lightning on black background';
    const result = buildImagePromptPayload({
        prompt: base,
        basePrompt: base,
        editInstruction: 'Make the dragon more realistic and add more purple lightning.',
        style: 'photorealistic',
    });

    assert.equal(result.userPrompt, base);
    assert.match(result.enhancedPrompt, /golden dragon/i);
    assert.match(result.enhancedPrompt, /more realistic/i);
    assert.match(result.enhancedPrompt, /photorealistic/i);
});
