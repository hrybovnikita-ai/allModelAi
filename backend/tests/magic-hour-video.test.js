const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../app');
const { validateVideoBody } = require('../src/services/videoValidation');
const { mapMagicHourHttpError, MagicHourError } = require('../src/services/magicHourClient');
const { getMagicHourApiKey, resolveVideoProviderPreference } = require('../src/services/magicHourConfig');
const { getJobForUser, createJob } = require('../src/services/videoJobStore');

const savedMagic = process.env.MAGIC_HOUR_API_KEY;
const savedTypo = process.env.MAGIC_CHOUR_API_KEY;
const savedGemini = process.env.GEMINI_API_KEY;
const savedProvider = process.env.VIDEO_PROVIDER;

test.afterEach(() => {
    if (savedMagic === undefined) delete process.env.MAGIC_HOUR_API_KEY;
    else process.env.MAGIC_HOUR_API_KEY = savedMagic;
    if (savedTypo === undefined) delete process.env.MAGIC_CHOUR_API_KEY;
    else process.env.MAGIC_CHOUR_API_KEY = savedTypo;
    if (savedGemini === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = savedGemini;
    if (savedProvider === undefined) delete process.env.VIDEO_PROVIDER;
    else process.env.VIDEO_PROVIDER = savedProvider;
    delete global.fetch;
});

test('validateVideoBody accepts text-to-video payload', () => {
    const result = validateVideoBody({ prompt: 'A dragon over the city', aspectRatio: '16:9', resolution: '720p', durationSeconds: 5 });
    assert.equal(result.error, undefined);
    assert.equal(result.value.durationSeconds, 5);
});

test('validateVideoBody rejects oversized data-url image', () => {
    const big = Buffer.alloc(9 * 1024 * 1024, 1).toString('base64');
    const result = validateVideoBody({ prompt: 'Animate', imageUrl: `data:image/png;base64,${big}` });
    assert.match(result.error, /too large/i);
});

test('Magic Hour HTTP errors map to user-safe codes', () => {
    const err402 = mapMagicHourHttpError(402, { code: 'insufficient_credits', message: 'Need credits' });
    assert.equal(err402.code, 'MAGIC_HOUR_INSUFFICIENT_CREDITS');
    const err429 = mapMagicHourHttpError(429, { message: 'Slow down' }, '30');
    assert.equal(err429.code, 'MAGIC_HOUR_RATE_LIMIT');
    assert.equal(err429.retryAfterSeconds, 30);
    const err401Missing = mapMagicHourHttpError(401, { code: 'unauthorized' }, null, { keyConfigured: false });
    assert.equal(err401Missing.code, 'MAGIC_HOUR_NOT_CONFIGURED');
    const err401Rejected = mapMagicHourHttpError(401, { code: 'unauthorized' }, null, { keyConfigured: true });
    assert.equal(err401Rejected.code, 'MAGIC_HOUR_UNAUTHORIZED');
    assert.equal(err401Rejected.providerRejected, true);
    assert.equal(err401Rejected.status, 401);
    assert.match(err401Rejected.message, /rejected/i);
});

test('provider preference prefers Magic Hour when key is configured', () => {
    process.env.VIDEO_PROVIDER = 'auto';
    process.env.MAGIC_HOUR_API_KEY = 'mhk_test_key';
    delete process.env.GEMINI_API_KEY;
    assert.equal(resolveVideoProviderPreference(), 'magichour');
    assert.ok(getMagicHourApiKey());
});

test('MAGIC_CHOUR_API_KEY typo alias loads when canonical name is unset', () => {
    delete process.env.MAGIC_HOUR_API_KEY;
    process.env.MAGIC_CHOUR_API_KEY = 'mhk_test_typo_alias';
    assert.equal(getMagicHourApiKey(), 'mhk_test_typo_alias');
    delete process.env.MAGIC_CHOUR_API_KEY;
});

test('POST /api/video/generate returns 401 when Magic Hour rejects the API key (mocked)', async () => {
    process.env.MAGIC_HOUR_API_KEY = 'mhk_test_rejected';
    process.env.VIDEO_PROVIDER = 'magichour';
    delete process.env.GEMINI_API_KEY;
    global.fetch = async (url) => {
        const href = String(url);
        if (href.includes('/v1/text-to-video') || href.includes('/v1/files/upload-urls')) {
            return new Response(JSON.stringify({ code: 'unauthorized', message: 'Unauthorized' }), { status: 401 });
        }
        throw new Error(`Unexpected fetch: ${href}`);
    };
    process.env.ENABLE_PLUS_TEST_MODE = 'true';
    const agent = request.agent(app);
    const email = `mh-auth-${Date.now()}@example.com`;
    process.env.DEVELOPER_EMAILS = email;
    await agent.post('/api/auth/register').send({ name: 'MH Auth', email, password: 'Password123!' });
    await agent.patch('/api/access-mode').send({ mode: 'developer' });
    const response = await agent.post('/api/video/generate').send({
        prompt: 'A calm ocean at sunset',
        resolution: '480p',
        durationSeconds: 4,
        wait: true,
    });
    assert.equal(response.status, 401);
    assert.equal(response.body.code, 'MAGIC_HOUR_UNAUTHORIZED');
    assert.equal(response.body.providerRejected, true);
    assert.equal(response.body.keyConfigured, true);
    assert.match(response.body.message, /rejected/i);
});

test('GET /api/video/jobs/:id returns 401 without session', async () => {
    const response = await request(app).get('/api/video/jobs/vjob-test');
    assert.equal(response.status, 401);
});

test('POST /api/video/generate returns 401 without session (route registered)', async () => {
    const response = await request(app).post('/api/video/generate').send({ prompt: 'Test clip' });
    assert.equal(response.status, 401);
    assert.notEqual(response.body.message, 'Route not found');
});

test('POST /api/video/generate returns 503 when no provider configured', async () => {
    delete process.env.MAGIC_HOUR_API_KEY;
    delete process.env.MAGIC_CHOUR_API_KEY;
    delete process.env.GEMINI_API_KEY;
    process.env.ENABLE_PLUS_TEST_MODE = 'true';
    const agent = request.agent(app);
    const email = `video-${Date.now()}@example.com`;
    process.env.DEVELOPER_EMAILS = email;
    await agent.post('/api/auth/register').send({
        name: 'Video Tester',
        email,
        password: 'Password123!',
    });
    await agent.patch('/api/access-mode').send({ mode: 'developer' });
    const response = await agent.post('/api/video/generate').send({ prompt: 'A calm ocean at sunset' });
    assert.equal(response.status, 503);
    assert.ok(['VIDEO_NOT_CONFIGURED', 'MAGIC_HOUR_NOT_CONFIGURED', 'GEMINI_NOT_CONFIGURED'].includes(response.body.code));
});

test('job store enforces ownership lookup', async () => {
    const connection = app.locals.db;
    const job = await createJob(connection, {
        email: 'owner@example.com',
        provider: 'magic-hour',
        mode: 'text-to-video',
        prompt: 'test',
        status: 'queued',
    });
    assert.ok(await getJobForUser(connection, job.id, 'owner@example.com'));
    assert.equal(await getJobForUser(connection, job.id, 'other@example.com'), null);
});

test('mocked Magic Hour create + poll completes job', async () => {
    process.env.MAGIC_HOUR_API_KEY = 'mhk_test_key';
    process.env.VIDEO_PROVIDER = 'magichour';
    delete process.env.GEMINI_API_KEY;

    let pollCount = 0;
    global.fetch = async (url, options = {}) => {
        const href = String(url);
        if (href.includes('/v1/text-to-video')) {
            return new Response(JSON.stringify({ id: 'mh-project-1', credits_charged: 120 }), { status: 200 });
        }
        if (href.includes('/v1/video-projects/mh-project-1')) {
            pollCount += 1;
            if (pollCount < 2) {
                return new Response(JSON.stringify({ id: 'mh-project-1', status: 'rendering', downloads: [], credits_charged: 120 }), { status: 200 });
            }
            return new Response(JSON.stringify({
                id: 'mh-project-1',
                status: 'complete',
                credits_charged: 120,
                downloads: [{ url: 'https://videos.example/output.mp4', expires_at: new Date().toISOString() }],
            }), { status: 200 });
        }
        if (href.includes('videos.example/output.mp4')) {
            return new Response(Buffer.from('fake-mp4'), { status: 200, headers: { 'content-type': 'video/mp4' } });
        }
        throw new Error(`Unexpected fetch: ${href}`);
    };

    process.env.ENABLE_PLUS_TEST_MODE = 'true';
    const agent = request.agent(app);
    const email = `mh-video-${Date.now()}@example.com`;
    process.env.DEVELOPER_EMAILS = email;
    await agent.post('/api/auth/register').send({ name: 'MH Video', email, password: 'Password123!' });
    await agent.patch('/api/access-mode').send({ mode: 'developer' });
    const response = await agent.post('/api/video/generate').send({
        prompt: 'A golden dragon flying above a futuristic city at night',
        aspectRatio: '16:9',
        resolution: '480p',
        durationSeconds: 4,
        wait: true,
    });
    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.match(response.body.videoUrl, /\/api\/video\/jobs\//);
    assert.ok(pollCount >= 1);
});
