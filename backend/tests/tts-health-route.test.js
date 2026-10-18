const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.DB_FILE = path.join(os.tmpdir(), `allmodelai-tts-health-${process.pid}-${Date.now()}.sqlite`);

const app = require('../app');

after(() => {
  try {
    fs.rmSync(process.env.DB_FILE, { force: true });
  } catch {
    /* ignore */
  }
});

test('GET /api/tts/health is public and returns provider status shape', async () => {
  const res = await request(app).get('/api/tts/health');
  assert.notEqual(res.status, 404, 'TTS health route must be registered (restart backend if 404)');
  assert.ok([200, 503].includes(res.status), `unexpected status ${res.status}`);
  assert.equal(typeof res.body.ok, 'boolean');
  assert.equal(res.body.service, 'allmodelai-tts');
  assert.ok(res.body.providers);
  assert.equal(typeof res.body.providers.browser, 'boolean');
  assert.equal(typeof res.body.providers.kokoro, 'boolean');
  assert.ok(res.body.kokoro);
  assert.equal(typeof res.body.kokoro.available, 'boolean');
});

test('GET /api/tts/catalog still requires auth', async () => {
  const res = await request(app).get('/api/tts/catalog');
  assert.equal(res.status, 401);
});

test('authenticated catalog includes Kokoro fields when health succeeds', async () => {
  const email = `tts-health-${Date.now()}@example.com`;
  const password = 'TtsHealthPass123';
  const agent = request.agent(app);

  const register = await agent.post('/api/auth/register').send({
    name: 'TTS Health',
    email,
    password,
    rememberMe: true,
  });
  assert.ok([200, 201].includes(register.status), `register failed: ${register.status}`);

  const catalog = await agent.get('/api/tts/catalog');
  assert.equal(catalog.status, 200);
  assert.ok(Array.isArray(catalog.body.voices));
  assert.ok(catalog.body.providers);
  assert.equal(typeof catalog.body.providers.kokoro, 'boolean');
  assert.ok(catalog.body.kokoro);

  // Cleanup
  try {
    app.locals.db.database.prepare('DELETE FROM users WHERE lower(email) = ?').run(email.toLowerCase());
  } catch {
    /* ignore */
  }
});
