const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const request = require('supertest');
const jwt = require('jsonwebtoken');
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = crypto.randomBytes(48).toString('hex');
delete process.env.REDIS_URL;
process.env.DB_FILE = path.join(os.tmpdir(), 'allmodelai-jwt-' + crypto.randomUUID() + '.sqlite');
const app = require('../app');
const { createSessionToken, validSessionToken } = require('../src/sessionToken');
const { createCache } = require('../src/cache');
after(async () => { await app.locals.cache.close(); app.locals.db.close(); fs.rmSync(process.env.DB_FILE, { force: true }); });
test('JWT cookie authenticates and logout revokes a replay', async () => {
  const agent = request.agent(app);
  const response = await agent.post('/api/auth/register').send({ name: 'JWT User', email: 'jwt@example.com', password: 'A secure password' });
  assert.equal(response.status, 201);
  const cookie = response.headers['set-cookie'][0].split(';')[0];
  const token = cookie.slice(cookie.indexOf('=') + 1);
  assert.equal(token.split('.').length, 3);
  assert.ok(validSessionToken(token));
  assert.equal((await agent.get('/api/auth/session')).status, 200);
  assert.equal((await agent.get('/api/chat/history')).status, 200);
  await agent.post('/api/auth/logout');
  assert.equal((await request(app).get('/api/auth/session').set('Cookie', cookie)).status, 401);
  assert.equal((await request(app).get('/api/chat/history').set('Cookie', cookie)).status, 401);
});
test('JWT rejects expired, tampered, wrong audience and wrong algorithm tokens', () => {
  const token = createSessionToken(1, Date.now() + 60000);
  assert.equal(validSessionToken(token + 'x'), false);
  assert.equal(validSessionToken(createSessionToken(1, Date.now() - 10000)), false);
  const claims = { sub: '1', exp: Math.floor(Date.now()/1000) + 60 };
  for (const options of [
    { algorithm: 'HS256', issuer: 'allmodelai', audience: 'other' },
    { algorithm: 'HS384', issuer: 'allmodelai', audience: 'allmodelai-session' },
    { algorithm: 'HS256', issuer: 'other', audience: 'allmodelai-session' },
  ]) assert.equal(validSessionToken(jwt.sign(claims, process.env.JWT_SECRET, options)), false);
});
test('local cache expires and isolates returned objects', async () => {
  let now = 0;
  const cache = createCache({ now: () => now });
  await cache.set('key', { value: 1 }, 2);
  const result = await cache.get('key');
  result.value = 2;
  assert.deepEqual(await cache.get('key'), { value: 1 });
  now = 2001;
  assert.equal(await cache.get('key'), null);
});
test('Redis adapter sets TTL, reads shared values and falls back on failure', async () => {
  const calls = [];
  let fail = false;
  const client = { isReady: true, async set(...args) { calls.push(args); }, async get() { if (fail) throw Error('offline'); return '{"shared":true}'; } };
  const cache = createCache({ client });
  await cache.set('key', { local: true }, 30);
  assert.deepEqual(calls[0], ['key', '{"local":true}', { EX: 30 }]);
  assert.deepEqual(await cache.get('key'), { shared: true });
  fail = true;
  assert.deepEqual(await cache.get('key'), { local: true });
});
test('public model status is cached while session responses remain private', async () => {
  const first = await request(app).get('/api/status/models');
  const second = await request(app).get('/api/status/models');
  assert.equal(first.headers['x-cache'], 'MISS');
  assert.equal(second.headers['x-cache'], 'HIT');
  assert.deepEqual(first.body, second.body);
  const session = await request(app).get('/api/auth/session');
  assert.equal(session.status, 401);
  assert.equal(session.headers['x-cache'], undefined);
  assert.equal(session.headers['cache-control'], 'no-store');
});
