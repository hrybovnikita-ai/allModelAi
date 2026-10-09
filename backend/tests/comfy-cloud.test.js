const test = require('node:test');
const assert = require('node:assert/strict');
const { generateImage } = require('../src/images');
const { buildComfyCloudWorkflow } = require('../src/comfyCloud/workflow');
const { submitComfyCloudPrompt, getComfyCloudJobStatus } = require('../src/comfyCloud/generate');

const originalFetch = global.fetch;
const envNames = [
    'COMFY_CLOUD_API_KEY', 'COMFY_CLOUD_BASE_URL', 'IMAGE_PROVIDER',
    'POLLINATIONS_API_KEY', 'OPENAI_API_KEY', 'IMAGE_API_KEY',
];
const saved = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));

function clearEnv() {
    envNames.forEach((name) => delete process.env[name]);
}

function restoreEnv() {
    clearEnv();
    for (const [name, value] of Object.entries(saved)) {
        if (value !== undefined) process.env[name] = value;
    }
}

test.afterEach(() => {
    global.fetch = originalFetch;
    restoreEnv();
});

test('buildComfyCloudWorkflow injects prompt and dimensions', () => {
    clearEnv();
    const { workflow, width, height } = buildComfyCloudWorkflow({
        prompt: 'golden dragon',
        size: '1536x1024',
        quality: 'hd',
    });
    assert.equal(workflow['6'].inputs.text, 'golden dragon');
    assert.equal(workflow['5'].inputs.width, 1536);
    assert.equal(workflow['5'].inputs.height, 1024);
    assert.equal(width, 1536);
    assert.equal(height, 1024);
    assert.ok(workflow['3'].inputs.steps >= 4);
});

test('submitComfyCloudPrompt sends X-API-Key header', async () => {
    clearEnv();
    process.env.COMFY_CLOUD_API_KEY = 'comfy_test_key';
    process.env.COMFY_CLOUD_BASE_URL = 'https://cloud.example.test';
    let seenUrl;
    let seenHeaders;
    global.fetch = async (url, options) => {
        seenUrl = url;
        seenHeaders = options.headers;
        return Response.json({ prompt_id: '11111111-1111-1111-1111-111111111111' });
    };
    const id = await submitComfyCloudPrompt({ '6': { class_type: 'CLIPTextEncode', inputs: {} } });
    assert.equal(id, '11111111-1111-1111-1111-111111111111');
    assert.equal(seenUrl, 'https://cloud.example.test/api/prompt');
    assert.equal(seenHeaders['X-API-Key'], 'comfy_test_key');
});

test('waitForComfyCloudJob accepts success terminal status', async () => {
    clearEnv();
    process.env.COMFY_CLOUD_API_KEY = 'comfy_test_key';
    process.env.COMFY_CLOUD_BASE_URL = 'https://cloud.example.test';
    process.env.COMFY_CLOUD_POLL_INTERVAL_MS = '5';
    const { waitForComfyCloudJob } = require('../src/comfyCloud/generate');
    global.fetch = async (url) => {
        assert.match(String(url), /\/api\/job\/abc\/status$/);
        return Response.json({ status: 'success' });
    };
    const result = await waitForComfyCloudJob('abc');
    assert.equal(result.status, 'success');
});

test('getComfyCloudJobStatus reads status payload', async () => {
    clearEnv();
    process.env.COMFY_CLOUD_API_KEY = 'comfy_test_key';
    process.env.COMFY_CLOUD_BASE_URL = 'https://cloud.example.test';
    global.fetch = async (url) => {
        assert.match(url, /\/api\/job\/abc\/status$/);
        return Response.json({ status: 'in_progress' });
    };
    const status = await getComfyCloudJobStatus('abc');
    assert.equal(status.status, 'in_progress');
});

test('generateImage uses Comfy Cloud when configured as primary provider', async () => {
    clearEnv();
    process.env.COMFY_CLOUD_API_KEY = 'comfy_test_key';
    process.env.IMAGE_PROVIDER = 'comfy-cloud';
    process.env.COMFY_CLOUD_POLL_INTERVAL_MS = '10';
    process.env.COMFY_CLOUD_JOB_TIMEOUT_MS = '5000';

    const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const calls = [];
    global.fetch = async (url, options = {}) => {
        calls.push(url);
        if (url.endsWith('/api/prompt')) {
            return Response.json({ prompt_id: '22222222-2222-2222-2222-222222222222' });
        }
        if (url.includes('/api/job/') && url.endsWith('/status')) {
            return Response.json({ status: 'completed' });
        }
        if (url.includes('/api/jobs/')) {
            return Response.json({
                outputs: {
                    '9': {
                        images: [{ filename: 'allmodelai_00001_.png', subfolder: '', type: 'output' }],
                    },
                },
            });
        }
        if (url.includes('/api/view?')) {
            return new Response(Buffer.from(pngBase64, 'base64'), {
                status: 200,
                headers: { 'content-type': 'image/png' },
            });
        }
        throw new Error(`Unexpected fetch: ${url}`);
    };

    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    await generateImage({ body: { prompt: 'a violet dragon', async: false } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.provider, 'comfy-cloud');
    assert.match(res.body.imageUrl, /^data:image\/png;base64,/);
    assert.ok(calls.some((url) => url.includes('/api/prompt')));
});
