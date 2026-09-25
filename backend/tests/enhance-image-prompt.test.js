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
    assert.match(result.enhancedPrompt, /golden dragon/i);
    assert.match(result.enhancedPrompt, /purple/i);
    assert.match(result.enhancedPrompt, /black background/i);
    assert.match(result.enhancedPrompt, /Must preserve exactly/i);
    assert.match(result.enhancedPrompt, /Do not replace, recolor/i);
    assert.match(result.enhancedPrompt, /golden dragon/i);
    assert.match(result.enhancedPrompt, /no pink dragon/i);
    assert.equal(result.aspectSize, '1344x768');
});

test('draw me prefix and narysuy mne preserve gold dragon scene', () => {
    const result = enhanceImagePrompt({
        prompt: 'нарисуй мне золотого дракона с фиолетовыми молниями на чёрном фоне',
        quality: 'high',
    });

    assert.match(result.userPrompt, /золотого дракона/i);
    assert.match(result.enhancedPrompt, /golden dragon/i);
    assert.match(result.enhancedPrompt, /purple/i);
    assert.match(result.enhancedPrompt, /black background/i);
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
