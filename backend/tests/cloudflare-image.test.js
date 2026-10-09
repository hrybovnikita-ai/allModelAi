const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    buildCloudflareFluxRequestBody,
    buildRunUrl,
    generateCloudflareWorkersAiImage,
    isCloudflareImageConfigured,
    normalizeCloudflareModelId,
    parseCloudflareErrorEnvelope,
} = require('../src/services/cloudflareImageService');
const { listConfiguredImageProviders } = require('../src/services/imageGenerationService');

const names = [
    'CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_API_KEY',
    'IMAGE_PROVIDER', 'IMAGE_GENERATION_PROVIDER', 'IMAGE_ALLOW_FALLBACK',
    'CLOUDFLARE_IMAGE_MODEL',
];
const saved = Object.fromEntries(names.map((name) => [name, process.env[name]]));
const originalFetch = global.fetch;

function clearEnv() {
    names.forEach((name) => delete process.env[name]);
}

function restoreEnv() {
    for (const [name, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
    }
}

test('buildRunUrl keeps the model path literal (no percent-encoding)', () => {
    const url = buildRunUrl('acct-123', '@cf/black-forest-labs/flux-1-schnell');
    assert.match(url, /\/ai\/run\/@cf\/black-forest-labs\/flux-1-schnell$/);
    assert.doesNotMatch(url, /%40cf|%2F/);
});

test('normalizeCloudflareModelId rejects unknown shapes', () => {
    assert.equal(
        normalizeCloudflareModelId('flux-1-schnell'),
        '@cf/black-forest-labs/flux-1-schnell',
    );
    assert.equal(
        normalizeCloudflareModelId('@cf/black-forest-labs/flux-1-schnell'),
        '@cf/black-forest-labs/flux-1-schnell',
    );
});

test('buildCloudflareFluxRequestBody only sends FLUX-supported fields', () => {
    const body = buildCloudflareFluxRequestBody({
        prompt: '  golden dragon  ',
        steps: 6,
    });
    assert.deepEqual(body, { prompt: 'golden dragon', steps: 6 });
    assert.equal(buildCloudflareFluxRequestBody({ prompt: 'x', steps: 99 }).steps, undefined);
    assert.equal(buildCloudflareFluxRequestBody({ prompt: 'x', steps: 0 }).steps, undefined);
});

test('buildCloudflareFluxRequestBody truncates prompts to 2048 characters', () => {
    const longPrompt = 'a'.repeat(3000);
    const body = buildCloudflareFluxRequestBody({ prompt: longPrompt });
    assert.equal(body.prompt.length, 2048);
});

test('parseCloudflareErrorEnvelope extracts sanitized code and message', () => {
    const parsed = parseCloudflareErrorEnvelope({
        success: false,
        errors: [{ code: 'bad_request', message: 'Invalid request body' }],
    });
    assert.equal(parsed.upstreamCode, 'bad_request');
    assert.equal(parsed.message, 'Invalid request body');
});

test('does not treat OpenAI API_IMAGE_KEY as a Cloudflare token', () => {
    clearEnv();
    process.env.CLOUDFLARE_ACCOUNT_ID = 'acct';
    process.env.API_IMAGE_KEY = 'sk-openai-not-cloudflare';
    process.env.CLOUDFLARE_API_TOKEN = '';
    assert.equal(isCloudflareImageConfigured(), false);
    restoreEnv();
});

test('cloudflare auth failure maps to HTTP 401', async () => {
    clearEnv();
    process.env.CLOUDFLARE_ACCOUNT_ID = 'acct';
    process.env.CLOUDFLARE_API_TOKEN = 'token';
    global.fetch = async () => Response.json({ success: false, errors: [{ message: 'Unauthorized' }] }, { status: 401 });
    const result = await generateCloudflareWorkersAiImage({ prompt: 'dragon' });
    assert.equal(result.ok, false);
    assert.equal(result.clientStatus, 401);
    assert.equal(result.code, 'IMAGE_CLOUDFLARE_AUTH');
    global.fetch = originalFetch;
    restoreEnv();
});

test('cloudflare HTTP 400 logs upstream error and maps to IMAGE_INVALID_REQUEST', async () => {
    clearEnv();
    process.env.CLOUDFLARE_ACCOUNT_ID = 'acct';
    process.env.CLOUDFLARE_API_TOKEN = 'token';
    const logs = [];
    const originalLog = console.log;
    console.log = (...args) => logs.push(args);
    global.fetch = async (url, options) => {
        assert.match(String(url), /\/ai\/run\/@cf\/black-forest-labs\/flux-1-schnell$/);
        const body = JSON.parse(options.body);
        assert.deepEqual(Object.keys(body).sort(), ['prompt', 'steps'].sort());
        assert.equal(body.quality, undefined);
        assert.equal(body.size, undefined);
        return Response.json({
            success: false,
            errors: [{ code: 'bad_request', message: 'Invalid request body' }],
        }, { status: 400 });
    };
    const result = await generateCloudflareWorkersAiImage({ prompt: 'city skyline', steps: 4 });
    console.log = originalLog;
    assert.equal(result.ok, false);
    assert.equal(result.code, 'IMAGE_INVALID_REQUEST');
    assert.equal(result.clientStatus, 400);
    assert.match(result.internalMessage, /Invalid request body/);
    assert.match(result.userMessage, /Invalid request body/);
    const failLog = logs.find((entry) => entry[0] === '[IMAGE][cloudflare] generation failed');
    assert.ok(failLog);
    assert.equal(failLog[1].upstreamCode, 'bad_request');
    assert.equal(failLog[1].upstreamMessage, 'Invalid request body');
    global.fetch = originalFetch;
    restoreEnv();
});

test('accepts CLOUDFLARE_API_TOKEN and requires account id', () => {
    clearEnv();
    process.env.CLOUDFLARE_API_TOKEN = 'token-value';
    assert.equal(isCloudflareImageConfigured(), false);
    process.env.CLOUDFLARE_ACCOUNT_ID = 'acct';
    assert.equal(isCloudflareImageConfigured(), true);
    restoreEnv();
});

test('cloudflare JSON success returns data URL image', async () => {
    clearEnv();
    process.env.CLOUDFLARE_ACCOUNT_ID = 'acct';
    process.env.CLOUDFLARE_API_TOKEN = 'token';
    global.fetch = async (url, options) => {
        assert.match(String(url), /\/ai\/run\//);
        assert.match(options.headers.Authorization, /^Bearer token$/);
        assert.equal(options.headers.Accept, 'application/json');
        return Response.json({ success: true, result: { image: 'aGVsbG8=' } });
    };
    const result = await generateCloudflareWorkersAiImage({ prompt: 'golden dragon' });
    assert.equal(result.ok, true);
    assert.match(result.imageUrl, /^data:image\//);
    global.fetch = originalFetch;
    restoreEnv();
});

test('cloudflare JSON success accepts result as a base64 string', async () => {
    clearEnv();
    process.env.CLOUDFLARE_ACCOUNT_ID = 'acct';
    process.env.CLOUDFLARE_API_TOKEN = 'token';
    global.fetch = async () => Response.json({ success: true, result: 'aGVsbG8=' });
    const result = await generateCloudflareWorkersAiImage({ prompt: 'orb' });
    assert.equal(result.ok, true);
    assert.match(result.imageUrl, /^data:image\//);
    global.fetch = originalFetch;
    restoreEnv();
});

test('cloudflare binary image response is supported', async () => {
    clearEnv();
    process.env.CLOUDFLARE_ACCOUNT_ID = 'acct';
    process.env.CLOUDFLARE_API_TOKEN = 'token';
    global.fetch = async () => new Response(Buffer.from('hello'), {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
    });
    const result = await generateCloudflareWorkersAiImage({ prompt: 'city skyline' });
    assert.equal(result.ok, true);
    assert.match(result.imageUrl, /^data:image\/png;base64,/);
    global.fetch = originalFetch;
    restoreEnv();
});

test('explicit cloudflare provider does not enable fallback providers by default', () => {
    clearEnv();
    process.env.IMAGE_GENERATION_PROVIDER = 'cloudflare';
    process.env.CLOUDFLARE_ACCOUNT_ID = 'acct';
    process.env.CLOUDFLARE_API_TOKEN = 'token';
    process.env.POLLINATIONS_API_KEY = 'sk_pollinations_test';
    assert.deepEqual(listConfiguredImageProviders(), ['cloudflare']);
    process.env.IMAGE_ALLOW_FALLBACK = 'true';
    assert.ok(listConfiguredImageProviders().includes('pollinations'));
    restoreEnv();
});
