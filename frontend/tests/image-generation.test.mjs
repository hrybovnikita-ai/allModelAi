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
    });
    assert.equal(body.quality, 'ultra');
    assert.equal(body.aspectRatio, '9:16');
    assert.equal(body.style, 'anime');
    assert.equal(imageGeneration.QUALITY_LABELS.ultra, 'Ultra');
    assert.equal(imageGeneration.ASPECT_LABELS['16:9'], 'Landscape (16:9)');
    assert.equal(imageGeneration.IMAGE_QUALITIES.map((item) => item.label).join(','), 'Standard,HD,Ultra');
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
