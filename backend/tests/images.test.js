const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { generateImage, upscaleGeneratedImage } = require('../src/images');
const originalFetch = global.fetch;
const names = ['IMAGE_API_KEY','OPENAI_API_KEY','OPEN_AI_API_KEY','API_IMAGE_KEY','IMAGE_API_URL','IMAGE_PROVIDER','IMAGE_MODEL','CLOUDFLARE_ACCOUNT_ID','CLOUDFLARE_API_KEY','CLAUDEFLARE_API_KEY','CLOUDFLARE_IMAGE_MODEL','POLLINATIONS_API_KEY','POLINATIONS_API_KEY','POLLINATIONS_IMAGE_MODEL','POLLINATIONS_HD_MODEL','POLLINATIONS_ULTRA_MODEL','UPSCALE_API_URL','UPSCALE_API_KEY','COMFY_CLOUD_API_KEY','COMFY_CLOUD_BASE_URL','COMFY_CLOUD_POLL_INTERVAL_MS','COMFY_CLOUD_JOB_TIMEOUT_MS'];
const saved = Object.fromEntries(names.map(name => [name, process.env[name]]));
function clear() { names.forEach(name => delete process.env[name]); }
afterEach(() => { global.fetch = originalFetch; clear(); for (const [name,value] of Object.entries(saved)) if (value !== undefined) process.env[name] = value; });
async function generate(prompt = 'A golden dragon', extra = {}) {
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    const body = prompt && typeof prompt === 'object' ? prompt : { prompt, ...extra };
    await generateImage({ body }, res); return res;
}
test('validates prompts before calling the provider', async () => {
    clear(); global.fetch = () => { throw new Error('must not fetch'); };
    for (const prompt of ['', ' ', {}, 'a'.repeat(4001)]) assert.equal((await generate(prompt)).statusCode, 400);
});
test('accepts POLINATIONS_API_KEY typo alias for Pollinations', async () => {
    clear();
    delete process.env.POLLINATIONS_API_KEY;
    process.env.POLINATIONS_API_KEY = 'sk_pollinations_typo_alias';
    global.fetch = async (_url, options) => {
        assert.equal(options.headers.Authorization, 'Bearer sk_pollinations_typo_alias');
        return Response.json({ data: [{ b64_json: 'aGVsbG8=' }] });
    };
    const result = await generate();
    assert.equal(result.statusCode, 200);
    assert.equal(result.body.provider, 'pollinations');
});

test('uses Pollinations when sk_ pollinations key is configured', async () => {
    clear(); process.env.POLLINATIONS_API_KEY = 'sk_pollinations_test';
    global.fetch = async (url, options) => {
        assert.equal(url, 'https://gen.pollinations.ai/v1/images/generations');
        assert.equal(options.headers.Authorization, 'Bearer sk_pollinations_test');
        const body = JSON.parse(options.body);
        assert.equal(body.response_format, 'b64_json');
        assert.equal(body.model, 'flux');
        assert.equal(body.size, '1024x1024');
        assert.equal(body.quality, undefined);
        return Response.json({ data: [{ b64_json: 'aGVsbG8=' }] });
    };
    const result = await generate();
    assert.equal(result.body.imageUrl, 'data:image/png;base64,aGVsbG8=');
    assert.equal(result.body.provider, 'pollinations');
    assert.equal(result.body.success, true);
});

test('uses legacy OpenAI key and returns base64 image', async () => {
    clear(); process.env.IMAGE_PROVIDER = 'openai'; process.env.OPEN_AI_API_KEY = 'sk-test-key';
    global.fetch = async (url, options) => {
        assert.equal(url, 'https://api.openai.com/v1/images/generations');
        assert.equal(options.headers.Authorization, 'Bearer sk-test-key');
        const body = JSON.parse(options.body);
        assert.match(body.prompt, /golden dragon/i);
        assert.match(body.prompt, /clear details, coherent composition, clean edges/i);
        assert.equal(body.model, 'gpt-image-1');
        assert.equal(body.size, '1024x1024');
        assert.equal(body.quality, 'medium');
        assert.equal(body.output_format, 'png');
        assert.equal(body.response_format, undefined);
        return Response.json({ data: [{ b64_json: 'aGVsbG8=' }] });
    };
    assert.equal((await generate()).body.imageUrl, 'data:image/png;base64,aGVsbG8=');
});
test('does not send an OpenRouter key to OpenAI', async () => {
    clear(); process.env.API_IMAGE_KEY = 'sk-or-test';
    const result = await generate();
    assert.equal(result.statusCode, 503);
    assert.equal(result.body.code, 'IMAGE_NOT_CONFIGURED');
    assert.ok(Array.isArray(result.body.missingEnvVars));
});
test('Cloudflare requires an account and handles its image response', async () => {
    clear(); process.env.IMAGE_PROVIDER = 'cloudflare'; process.env.CLAUDEFLARE_API_KEY = 'cf-test';
    assert.equal((await generate()).statusCode, 503);
    process.env.CLOUDFLARE_ACCOUNT_ID = 'account';
    global.fetch = async (url, options) => { assert.match(url, /accounts\/account\/ai\/run/); assert.equal(options.headers.Authorization, 'Bearer cf-test'); return Response.json({ success: true, result: { image: 'aGVsbG8=' } }); };
    assert.equal((await generate()).body.imageUrl, 'data:image/jpeg;base64,aGVsbG8=');
});
test('pollinations 402 without fallback returns sanitized unavailable error', async () => {
    clear(); process.env.POLLINATIONS_API_KEY = 'sk_pollinations_test';
    global.fetch = async () => Response.json({ error: { message: 'Insufficient pollen balance', code: 'insufficient_quota' } }, { status: 402 });
    const result = await generate();
    assert.equal(result.statusCode, 503);
    assert.equal(result.body.success, false);
    assert.equal(result.body.code, 'IMAGE_GENERATION_UNAVAILABLE');
    assert.doesNotMatch(String(result.body.message), /pollen|Insufficient balance/i);
});

test('handles rejected keys, quotas and malformed responses without leaking secrets', async () => {
    clear(); process.env.IMAGE_PROVIDER = 'openai'; process.env.IMAGE_API_KEY = 'sk-secret';
    for (const status of [401, 403, 429, 500]) {
        global.fetch = async () => Response.json({ error: { message: 'Invalid API key sk-secret' } }, { status });
        const result = await generate();
        assert.equal(result.statusCode, 503);
        assert.equal(result.body.code, 'IMAGE_GENERATION_UNAVAILABLE');
        assert.doesNotMatch(String(result.body.message), /sk-secret|Invalid API key/i);
    }
    global.fetch = async () => new Response('not json');
    assert.equal((await generate()).statusCode, 503);
    global.fetch = async () => Response.json({ data: [{ url: 'javascript:alert(1)' }] });
    assert.equal((await generate()).statusCode, 503);
    global.fetch = async () => { throw new DOMException('timeout', 'TimeoutError'); };
    assert.equal((await generate()).statusCode, 504);
});

test('maps HD and Ultra to supported Pollinations models and sizes', async () => {
    clear(); process.env.POLLINATIONS_API_KEY = 'sk_pollinations_test';
    const sent = [];
    global.fetch = async (_url, options) => { sent.push(JSON.parse(options.body)); return Response.json({ data: [{ b64_json: 'aGVsbG8=' }] }); };
    const hd = await generate('A mountain lake', { quality: 'hd', aspectRatio: '16:9' });
    const ultra = await generate('A mountain lake', { quality: 'ultra', aspectRatio: '9:16' });
    const square = await generate('A mountain lake', { quality: 'standard', aspectRatio: '1:1' });
    assert.equal(sent[0].model, 'gptimage');
    assert.equal(sent[0].quality, 'high');
    assert.equal(sent[0].size, '1536x1024');
    assert.equal(hd.body.quality, 'hd');
    assert.equal(hd.body.size, '1536x1024');
    assert.equal(sent[1].model, 'gpt-image-2');
    assert.equal(sent[1].quality, 'hd');
    assert.equal(sent[1].size, '1024x1536');
    assert.equal(ultra.body.aspectRatio, '9:16');
    assert.equal(sent[2].model, 'flux');
    assert.equal(sent[2].quality, undefined);
    assert.equal(sent[2].size, '1024x1024');
    assert.equal(square.body.quality, 'standard');
});

test('standard flux landscape uses native 1536x1024 and a quality negative prompt', async () => {
    clear(); process.env.POLLINATIONS_API_KEY = 'sk_pollinations_test';
    let sent;
    global.fetch = async (_url, options) => { sent = JSON.parse(options.body); return Response.json({ data: [{ b64_json: 'aGVsbG8=' }] }); };
    const result = await generate('A wide valley', { quality: 'standard', aspectRatio: '16:9' });
    assert.equal(sent.model, 'flux');
    assert.equal(sent.size, '1536x1024');
    assert.match(sent.negative_prompt, /blurry/i);
    assert.equal(result.body.size, '1536x1024');
});

test('regenerate sends a new generation with the same quality and aspect', async () => {
    clear(); process.env.POLLINATIONS_API_KEY = 'sk_pollinations_test';
    const sent = [];
    global.fetch = async (_url, options) => { sent.push(JSON.parse(options.body)); return Response.json({ data: [{ b64_json: 'aGVsbG8=' }] }); };
    await generate('golden dragon', { quality: 'ultra', aspectRatio: '9:16' });
    await generate('golden dragon', { quality: 'ultra', aspectRatio: '9:16' });
    assert.equal(sent.length, 2);
    assert.deepEqual(sent[0], sent[1]);
});

test('rejects invalid quality, aspect, model, and provider before calling upstream', async () => {
    clear(); process.env.POLLINATIONS_API_KEY = 'sk_pollinations_test';
    global.fetch = () => { throw new Error('must not fetch'); };
    assert.equal((await generate('cat', { quality: 'maximum' })).statusCode, 400);
    assert.equal((await generate('cat', { aspectRatio: '4:3' })).statusCode, 400);
    assert.equal((await generate('cat', { model: 'not-a-real-model' })).statusCode, 400);
    assert.equal((await generate('cat', { provider: 'openai' })).statusCode, 400);
});

test('dall-e-3 ultra uses hd quality and the closest supported landscape size', async () => {
    clear(); process.env.IMAGE_PROVIDER = 'openai'; process.env.IMAGE_API_KEY = 'sk-test-key'; process.env.IMAGE_MODEL = 'dall-e-3';
    let sent;
    global.fetch = async (_url, options) => { sent = JSON.parse(options.body); return Response.json({ data: [{ b64_json: 'aGVsbG8=' }] }); };
    const result = await generate('A city skyline', { quality: 'ultra', aspectRatio: '16:9' });
    assert.equal(sent.quality, 'hd');
    assert.equal(sent.size, '1792x1024');
    assert.equal(sent.response_format, 'b64_json');
    assert.equal(sent.output_format, undefined);
    assert.equal(result.body.quality, 'ultra');
    assert.equal(result.body.size, '1792x1024');
});

test('cloudflare ultra only sends the supported steps parameter', async () => {
    clear(); process.env.IMAGE_PROVIDER = 'cloudflare'; process.env.CLOUDFLARE_API_KEY = 'cf-test'; process.env.CLOUDFLARE_ACCOUNT_ID = 'account';
    let sent;
    global.fetch = async (_url, options) => { sent = JSON.parse(options.body); return Response.json({ success: true, result: { image: 'aGVsbG8=' } }); };
    await generate('A portrait', { quality: 'ultra', aspectRatio: '9:16' });
    assert.equal(sent.steps, 8);
    assert.equal(sent.quality, undefined);
    assert.equal(sent.size, undefined);
});

test('redacts secrets from upstream image errors', async () => {
    clear(); process.env.POLLINATIONS_API_KEY = 'sk_pollinations_test';
    const logs = [];
    const original = console.log;
    console.log = (...args) => logs.push(args.join(' '));
    global.fetch = async () => Response.json({ error: { message: 'rejected sk_pollinations_test' } }, { status: 401 });
    const result = await generate();
    console.log = original;
    assert.equal(result.statusCode, 503);
    assert.equal(result.body.message.includes('sk_pollinations_test'), false);
    assert.equal(logs.some((line) => line.includes('sk_pollinations_test')), false);
});

test('upscale is unavailable until an external provider is configured', async () => {
    clear();
    global.fetch = () => { throw new Error('must not fetch'); };
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    await upscaleGeneratedImage({ body: { imageUrl: 'data:image/png;base64,aGVsbG8=' } }, res);
    assert.equal(res.statusCode, 501);
    assert.equal(res.body.upscaleSupported, false);
});

test('external upscale returns the provider image and does not log the key', async () => {
    clear();
    process.env.UPSCALE_API_URL = 'https://upscale.example/api';
    process.env.UPSCALE_API_KEY = 'sk_upscale_secret';
    const logs = [];
    const original = console.log;
    console.log = (...args) => logs.push(args.join(' '));
    global.fetch = async (url, options) => {
        assert.equal(url, 'https://upscale.example/api');
        assert.equal(options.headers.Authorization, 'Bearer sk_upscale_secret');
        return Response.json({ image: '/9j/4AAQSkZJRgABAQAAAQABAAD/2w==' });
    };
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    await upscaleGeneratedImage({ body: { imageUrl: 'data:image/png;base64,aGVsbG8=' } }, res);
    console.log = original;
    assert.equal(res.statusCode, 200);
    assert.match(res.body.imageUrl, /^data:image\/jpeg;base64,/);
    assert.equal(logs.some((line) => line.includes('sk_upscale_secret')), false);
});
