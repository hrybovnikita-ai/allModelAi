const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { generateImage } = require('../src/images');
const originalFetch = global.fetch;
const names = ['IMAGE_API_KEY','OPENAI_API_KEY','OPEN_AI_API_KEY','API_IMAGE_KEY','IMAGE_API_URL','IMAGE_PROVIDER','CLOUDFLARE_ACCOUNT_ID','CLOUDFLARE_API_KEY','CLAUDEFLARE_API_KEY'];
const saved = Object.fromEntries(names.map(name => [name, process.env[name]]));
function clear() { names.forEach(name => delete process.env[name]); }
afterEach(() => { global.fetch = originalFetch; clear(); for (const [name,value] of Object.entries(saved)) if (value !== undefined) process.env[name] = value; });
async function generate(prompt = 'A golden dragon') {
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    await generateImage({ body: { prompt } }, res); return res;
}
test('validates prompts before calling the provider', async () => {
    clear(); global.fetch = () => { throw new Error('must not fetch'); };
    for (const prompt of ['', ' ', {}, 'a'.repeat(4001)]) assert.equal((await generate(prompt)).statusCode, 400);
});
test('uses legacy OpenAI key and returns base64 image', async () => {
    clear(); process.env.OPEN_AI_API_KEY = 'sk-test-key';
    global.fetch = async (url, options) => {
        assert.equal(url, 'https://api.openai.com/v1/images/generations');
        assert.equal(options.headers.Authorization, 'Bearer sk-test-key');
        assert.equal(JSON.parse(options.body).prompt, 'A golden dragon');
        return Response.json({ data: [{ b64_json: 'aGVsbG8=' }] });
    };
    assert.equal((await generate()).body.imageUrl, 'data:image/png;base64,aGVsbG8=');
});
test('does not send an OpenRouter key to OpenAI', async () => {
    clear(); process.env.API_IMAGE_KEY = 'sk-or-test'; assert.equal((await generate()).statusCode, 503);
});
test('Cloudflare requires an account and handles its image response', async () => {
    clear(); process.env.IMAGE_PROVIDER = 'cloudflare'; process.env.CLAUDEFLARE_API_KEY = 'cf-test';
    assert.equal((await generate()).statusCode, 503);
    process.env.CLOUDFLARE_ACCOUNT_ID = 'account';
    global.fetch = async (url, options) => { assert.match(url, /accounts\/account\/ai\/run/); assert.equal(options.headers.Authorization, 'Bearer cf-test'); return Response.json({ success: true, result: { image: 'aGVsbG8=' } }); };
    assert.equal((await generate()).body.imageUrl, 'data:image/jpeg;base64,aGVsbG8=');
});
test('handles rejected keys, quotas and malformed responses without leaking secrets', async () => {
    clear(); process.env.IMAGE_API_KEY = 'sk-secret';
    for (const status of [401, 403, 429, 500]) {
        global.fetch = async () => Response.json({ error: { message: 'sk-secret' } }, { status });
        const result = await generate(); assert.equal(result.statusCode, status === 429 ? 429 : 502); assert.doesNotMatch(result.body.message, /sk-secret/);
    }
    global.fetch = async () => new Response('not json'); assert.equal((await generate()).statusCode, 502);
    global.fetch = async () => Response.json({ data: [{ url: 'javascript:alert(1)' }] }); assert.equal((await generate()).statusCode, 502);
    global.fetch = async () => { throw new DOMException('timeout', 'TimeoutError'); }; assert.equal((await generate()).statusCode, 504);
});
