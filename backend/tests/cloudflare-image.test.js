const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    generateCloudflareWorkersAiImage,
    isCloudflareImageConfigured,
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

test('does not treat OpenAI API_IMAGE_KEY as a Cloudflare token', () => {
    clearEnv();
    process.env.CLOUDFLARE_ACCOUNT_ID = 'acct';
    process.env.API_IMAGE_KEY = 'sk-openai-not-cloudflare';
    process.env.CLOUDFLARE_API_TOKEN = '';
    assert.equal(isCloudflareImageConfigured(), false);
    for (const [name, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
    }
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
    for (const [name, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
    }
});

test('accepts CLOUDFLARE_API_TOKEN and requires account id', () => {
    clearEnv();
    process.env.CLOUDFLARE_API_TOKEN = 'token-value';
    assert.equal(isCloudflareImageConfigured(), false);
    process.env.CLOUDFLARE_ACCOUNT_ID = 'acct';
    assert.equal(isCloudflareImageConfigured(), true);
    for (const [name, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
    }
});

test('cloudflare JSON success returns data URL image', async () => {
    clearEnv();
    process.env.CLOUDFLARE_ACCOUNT_ID = 'acct';
    process.env.CLOUDFLARE_API_TOKEN = 'token';
    global.fetch = async (url, options) => {
        assert.match(String(url), /\/ai\/run\//);
        assert.match(options.headers.Authorization, /^Bearer token$/);
        return Response.json({ success: true, result: { image: 'aGVsbG8=' } });
    };
    const result = await generateCloudflareWorkersAiImage({ prompt: 'golden dragon' });
    assert.equal(result.ok, true);
    assert.match(result.imageUrl, /^data:image\//);
    global.fetch = originalFetch;
    for (const [name, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
    }
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
    for (const [name, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
    }
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
    for (const [name, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
    }
});
