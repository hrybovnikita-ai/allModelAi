import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const PNG_1X1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

let server;
let imageGeneration;

before(async () => {
    server = await createServer({
        root: fileURLToPath(new URL('../', import.meta.url)),
        server: { middlewareMode: true, watch: null, hmr: false, ws: false },
        appType: 'custom',
    });
    imageGeneration = await server.ssrLoadModule('/src/lib/imageGeneration.js');
});

after(async () => { await server?.close(); });

test('image request keeps the selected quality and aspect', () => {
    const body = imageGeneration.buildImageRequestBody({
        prompt: 'golden dragon',
        quality: 'ultra',
        aspectRatio: '9:16',
        style: 'anime',
        count: 4,
    });
    assert.equal(body.quality, 'ultra');
    assert.equal(body.aspectRatio, '9:16');
    assert.equal(body.style, 'anime');
    assert.equal(body.count, 4);
    assert.equal(imageGeneration.QUALITY_LABELS.ultra, 'Ultra');
    assert.equal(imageGeneration.ASPECT_LABELS['16:9'], 'Landscape (16:9)');
    assert.equal(imageGeneration.IMAGE_QUALITIES.map((item) => item.label).join(','), 'Standard,HD,Ultra');
});

test('user-facing image errors surface server configuration hints', () => {
    const { userFacingImageGenerationError, IMAGE_NOT_CONFIGURED_MESSAGE } = imageGeneration;
    assert.match(
        userFacingImageGenerationError(false, {
            code: 'IMAGE_NOT_CONFIGURED',
            missingEnvVars: ['POLLINATIONS_API_KEY (recommended; POLINATIONS_API_KEY alias accepted)'],
        }),
        /POLLINATIONS_API_KEY/,
    );
    assert.match(
        userFacingImageGenerationError(false, { code: 'IMAGE_NOT_CONFIGURED' }),
        new RegExp(IMAGE_NOT_CONFIGURED_MESSAGE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    );
});

test('user-facing image errors hide provider billing details', () => {
    const { userFacingImageGenerationError, IMAGE_UNAVAILABLE_MESSAGE } = imageGeneration;
    assert.equal(
        userFacingImageGenerationError(false, {
            code: 'IMAGE_GENERATION_UNAVAILABLE',
            message: 'Insufficient balance 0.0094 pollen Top up at enter.pollinations.ai',
        }),
        IMAGE_UNAVAILABLE_MESSAGE,
    );
    assert.equal(
        userFacingImageGenerationError(false, {
            message: 'Insufficient balance available balance: 0.0000 pollen',
        }),
        IMAGE_UNAVAILABLE_MESSAGE,
    );
    assert.equal(userFacingImageGenerationError(true, { success: true, imageUrl: 'https://example.com/a.png' }), null);
});

test('normalizeImageGenerationResult prefers images array', () => {
    const normalized = imageGeneration.normalizeImageGenerationResult({
        imageUrl: 'https://example.com/one.png',
        images: [{ imageUrl: 'https://example.com/a.png' }, { imageUrl: 'https://example.com/b.png' }],
    });
    assert.equal(normalized.imageCount, 2);
    assert.equal(normalized.imageUrl, 'https://example.com/a.png');
});

test('download bytes are the original base64 payload', () => {
    const decoded = imageGeneration.dataImageBytes(`data:image/png;base64,${PNG_1X1}`);
    assert.equal(decoded.mimeType, 'image/png');
    assert.equal(decoded.bytes[0], 0x89);
    assert.equal(decoded.bytes[1], 0x50);
    assert.equal(decoded.bytes[2], 0x4e);
    assert.equal(decoded.bytes[3], 0x47);
    assert.equal(decoded.bytes.length, Buffer.from(PNG_1X1, 'base64').length);
});
