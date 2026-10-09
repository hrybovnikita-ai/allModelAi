const { describe, test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { generateImage } = require('../src/images');
const {
    listConfiguredImageProviders,
    isRetryableProviderFailure,
    USER_UNAVAILABLE_MESSAGE,
} = require('../src/services/imageGenerationService');

const names = [
    'IMAGE_API_KEY', 'OPENAI_API_KEY', 'OPEN_AI_API_KEY', 'API_IMAGE_KEY', 'IMAGE_API_URL',
    'IMAGE_PROVIDER', 'IMAGE_MODEL', 'CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_KEY',
    'POLLINATIONS_API_KEY', 'POLLINATIONS_IMAGE_MODEL',
    'COMFY_CLOUD_API_KEY', 'COMFYUI_API_KEY', 'COMFY_CLOUD_BASE_URL',
];
const saved = Object.fromEntries(names.map((name) => [name, process.env[name]]));
const originalFetch = global.fetch;

function clearEnv() {
    names.forEach((name) => delete process.env[name]);
}

afterEach(() => {
    global.fetch = originalFetch;
    clearEnv();
    for (const [name, value] of Object.entries(saved)) {
        if (value !== undefined) process.env[name] = value;
    }
});

async function generate(prompt = 'A golden dragon', extra = {}) {
    const res = {
        statusCode: 200,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(body) {
            this.body = body;
            return this;
        },
    };
    const body = prompt && typeof prompt === 'object'
        ? { async: false, ...prompt }
        : { prompt, async: false, ...extra };
    await generateImage({ body }, res);
    return res;
}

describe('Image generation fallback', () => {
    test('isRetryableProviderFailure treats 402 and balance errors as retryable', () => {
        assert.equal(isRetryableProviderFailure({ status: 402, message: 'Insufficient balance' }), true);
        assert.equal(isRetryableProviderFailure({ status: 429, message: 'rate limit' }), true);
    });

    test('comfy-cloud 403 falls back to pollinations', async () => {
        clearEnv();
        process.env.COMFY_CLOUD_API_KEY = 'comfy_test_key';
        process.env.IMAGE_PROVIDER = 'comfy-cloud';
        process.env.POLLINATIONS_API_KEY = 'sk_pollinations_test';
        let call = 0;
        global.fetch = async (url) => {
            call += 1;
            const href = String(url);
            if (href.includes('cloud.example.test') || href.includes('cloud.comfy.org')) {
                return Response.json(
                    { message: 'API key authentication is not available for free tier accounts' },
                    { status: 403 },
                );
            }
            if (href.includes('pollinations')) {
                return Response.json({ data: [{ b64_json: 'aGVsbG8=' }] });
            }
            return Response.json({ data: [{ b64_json: 'aGVsbG8=' }] });
        };
        process.env.COMFY_CLOUD_BASE_URL = 'https://cloud.example.test';
        const result = await generate();
        assert.ok(call >= 2);
        assert.equal(result.statusCode, 200);
        assert.equal(result.body.success, true);
        assert.equal(result.body.provider, 'pollinations');
    });

    test('pollinations 402 falls back to openai and succeeds', async () => {
        clearEnv();
        process.env.POLLINATIONS_API_KEY = 'sk_pollinations_test';
        process.env.IMAGE_PROVIDER = 'pollinations';
        process.env.IMAGE_API_KEY = 'sk-openai-fallback';
        let call = 0;
        global.fetch = async (url) => {
            call += 1;
            if (String(url).includes('pollinations')) {
                return Response.json(
                    { error: { message: 'Insufficient balance available balance: 0.0000 pollen' } },
                    { status: 402 },
                );
            }
            return Response.json({ data: [{ b64_json: 'aGVsbG8=' }] });
        };
        const result = await generate();
        assert.ok(call >= 2);
        assert.equal(result.statusCode, 200);
        assert.equal(result.body.success, true);
        assert.equal(result.body.provider, 'openai');
        assert.ok(result.body.imageUrl);
        assert.doesNotMatch(JSON.stringify(result.body), /pollen|Insufficient balance|enter\.pollinations/i);
    });

    test('pollinations 429 falls back to openai', async () => {
        clearEnv();
        process.env.POLLINATIONS_API_KEY = 'sk_pollinations_test';
        process.env.IMAGE_API_KEY = 'sk-openai-fallback';
        global.fetch = async (url) => {
            if (String(url).includes('pollinations')) {
                return Response.json({ error: { message: 'rate limit exceeded' } }, { status: 429 });
            }
            return Response.json({ data: [{ b64_json: 'aGVsbG8=' }] });
        };
        const result = await generate();
        assert.equal(result.statusCode, 200);
        assert.equal(result.body.provider, 'openai');
    });

    test('pollinations timeout falls back when next provider succeeds', async () => {
        clearEnv();
        process.env.POLLINATIONS_API_KEY = 'sk_pollinations_test';
        process.env.IMAGE_API_KEY = 'sk-openai-fallback';
        global.fetch = async (url) => {
            if (String(url).includes('pollinations')) {
                throw new DOMException('timeout', 'TimeoutError');
            }
            return Response.json({ data: [{ b64_json: 'aGVsbG8=' }] });
        };
        const result = await generate();
        assert.equal(result.statusCode, 200);
        assert.equal(result.body.success, true);
    });

    test('all providers fail returns clean user-facing error', async () => {
        clearEnv();
        process.env.POLLINATIONS_API_KEY = 'sk_pollinations_test';
        process.env.IMAGE_API_KEY = 'sk-openai-fallback';
        global.fetch = async () => Response.json(
            { error: { message: 'Insufficient balance 0.0094 pollen Top up at enter.pollinations.ai' } },
            { status: 402 },
        );
        const result = await generate();
        assert.equal(result.statusCode, 502);
        assert.equal(result.body.success, false);
        assert.equal(result.body.code, 'IMAGE_GENERATION_UNAVAILABLE');
        assert.equal(result.body.message, USER_UNAVAILABLE_MESSAGE);
        assert.doesNotMatch(JSON.stringify(result.body), /pollen|enter\.pollinations|Insufficient balance/i);
    });

    test('regenerate uses the same pipeline (two successful calls)', async () => {
        clearEnv();
        process.env.POLLINATIONS_API_KEY = 'sk_pollinations_test';
        const bodies = [];
        global.fetch = async (_url, options) => {
            bodies.push(JSON.parse(options.body));
            return Response.json({ data: [{ b64_json: 'aGVsbG8=' }] });
        };
        await generate('golden dragon', { quality: 'ultra', aspectRatio: '9:16' });
        await generate('golden dragon', { quality: 'ultra', aspectRatio: '9:16' });
        assert.ok(bodies.length >= 2);
        assert.deepEqual(bodies[bodies.length - 2], bodies[bodies.length - 1]);
    });

    test('listConfiguredImageProviders respects explicit IMAGE_PROVIDER first', () => {
        clearEnv();
        process.env.IMAGE_PROVIDER = 'openai';
        process.env.IMAGE_API_KEY = 'sk-test';
        process.env.POLLINATIONS_API_KEY = 'sk_pollinations_test';
        const list = listConfiguredImageProviders();
        assert.equal(list[0], 'openai');
        assert.ok(list.includes('pollinations'));
    });
});
