import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

let server;
let videoGeneration;

test.before(async () => {
    server = await createServer({
        root: fileURLToPath(new URL('../', import.meta.url)),
        server: { middlewareMode: true, watch: null, hmr: false, ws: false },
        appType: 'custom',
    });
    videoGeneration = await server.ssrLoadModule('/src/lib/videoGeneration.js');
});

test.after(async () => { await server?.close(); });

test('video request body includes prompt and aspect', () => {
    const body = videoGeneration.buildVideoRequestBody({
        prompt: 'Ocean waves at sunset',
        aspectRatio: '9:16',
        resolution: '1080p',
    });
    assert.equal(body.prompt, 'Ocean waves at sunset');
    assert.equal(body.aspectRatio, '9:16');
    assert.equal(body.resolution, '1080p');
});

test('user-facing video errors hide raw upstream for generic failures', () => {
    assert.match(
        videoGeneration.userFacingVideoError(false, { code: 'GEMINI_NOT_CONFIGURED', missingEnvVars: ['GEMINI_API_KEY'] }),
        /GEMINI_API_KEY/,
    );
    assert.equal(
        videoGeneration.userFacingVideoError(false, { code: 'GEMINI_VIDEO_FAILED' }),
        videoGeneration.VIDEO_UNAVAILABLE_MESSAGE,
    );
});
