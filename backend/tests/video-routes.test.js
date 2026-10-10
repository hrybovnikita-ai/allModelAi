const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../app');

test('video API routes are registered (not 404)', async () => {
    const status = await request(app).get('/api/videos/status');
    assert.notEqual(status.status, 404, status.body?.message);

    const unauthGenerate = await request(app).post('/api/video/generate').send({ prompt: 'test' });
    assert.equal(unauthGenerate.status, 401, 'POST /api/video/generate should require auth, not 404');

    const unauthAlias = await request(app).post('/api/videos').send({ prompt: 'test' });
    assert.equal(unauthAlias.status, 401, 'POST /api/videos alias should require auth, not 404');

});

test('GET /api/videos/status documents generate route when Magic Hour env is set', async () => {
    const previous = process.env.MAGIC_HOUR_API_KEY;
    process.env.MAGIC_HOUR_API_KEY = 'mhk_test_route_check';
    const agent = request.agent(app);
    await agent.post('/api/auth/register').send({
        name: 'Route Check',
        email: `video-route-${Date.now()}@example.com`,
        password: 'Password123!',
    });
    const response = await agent.get('/api/videos/status');
    if (previous === undefined) delete process.env.MAGIC_HOUR_API_KEY;
    else process.env.MAGIC_HOUR_API_KEY = previous;
    assert.equal(response.status, 200);
    assert.equal(response.body.routes?.generatePost, 'POST /api/video/generate');
    assert.equal(response.body.providers?.magichour?.apiKeyPresent, true);
    assert.equal(response.body.providers?.magichour?.configured, true);
    assert.equal(response.body.providers?.magichour?.apiKeySource, 'MAGIC_HOUR_API_KEY');
    assert.ok(response.body.providers?.magichour?.keyPrefixHint);
});

test('GET /api/videos/status?probeAuth=1 reports Magic Hour auth probe (mocked)', async () => {
    const previous = process.env.MAGIC_HOUR_API_KEY;
    process.env.MAGIC_HOUR_API_KEY = 'mhk_test_probe';
    global.fetch = async (url) => {
        if (String(url).includes('/v1/account')) {
            return new Response(JSON.stringify({ code: 'unauthorized' }), { status: 401 });
        }
        throw new Error(`Unexpected fetch: ${url}`);
    };
    const agent = request.agent(app);
    await agent.post('/api/auth/register').send({
        name: 'Probe Check',
        email: `video-probe-${Date.now()}@example.com`,
        password: 'Password123!',
    });
    const response = await agent.get('/api/videos/status?probeAuth=1');
    if (previous === undefined) delete process.env.MAGIC_HOUR_API_KEY;
    else process.env.MAGIC_HOUR_API_KEY = previous;
    delete global.fetch;
    assert.equal(response.status, 200);
    assert.equal(response.body.providers?.magichour?.authProbe?.ok, false);
    assert.equal(response.body.providers?.magichour?.authProbe?.httpStatus, 401);
    assert.equal(response.body.providers?.magichour?.authProbe?.keyConfigured, true);
});
