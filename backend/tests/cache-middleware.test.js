const { test } = require('node:test');
const assert = require('node:assert/strict');
const { cachePublicResponse, createCache } = require('../src/cache');

test('cachePublicResponse calls next when redis get never resolves', async () => {
    process.env.CACHE_MIDDLEWARE_TIMEOUT_MS = '80';
    const slowClient = {
        isReady: true,
        async get() {
            return new Promise(() => {});
        },
        async set() {},
    };
    const cache = createCache({ client: slowClient });
    const middleware = cachePublicResponse('test:slow-key', 30);

    const req = { app: { locals: { cache } } };
    let nextCalled = false;
    const res = {
        headersSent: false,
        setHeader() {},
        json() {
            this.headersSent = true;
        },
    };

    const started = Date.now();
    await middleware(req, res, () => {
        nextCalled = true;
    });
    assert.equal(nextCalled, true);
    assert.ok(Date.now() - started < 500, 'cache middleware should fail open quickly');
    delete process.env.CACHE_MIDDLEWARE_TIMEOUT_MS;
});
