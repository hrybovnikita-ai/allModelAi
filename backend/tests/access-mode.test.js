const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const request = require('supertest');
process.env.NODE_ENV = 'test';
process.env.DB_FILE = path.join(os.tmpdir(), `allmodelai-access-${process.pid}.sqlite`);
process.env.ENABLE_PLUS_TEST_MODE = 'true';
process.env.DEVELOPER_EMAILS = 'developer@access.test';
process.env.API_KEY = 'test-gateway';
const { FREE_USER_MODEL_KEYS } = require('../src/billing/modelEntitlements');
const FREE_USER_MODEL_COUNT = FREE_USER_MODEL_KEYS.length;
const app = require('../app');
let user, developer;
const originalFetch = global.fetch;
before(async () => {
  user = request.agent(app); developer = request.agent(app);
  await user.post('/api/auth/register').send({ name: 'User', email: 'user@access.test', password: 'access-test-password' });
  await developer.post('/api/auth/register').send({ name: 'Developer', email: 'developer@access.test', password: 'access-test-password' });
});
after(() => { global.fetch = originalFetch; app.locals.db.close(); });
test('User tier model list matches free plan and cannot grant Developer access', async () => {
  const access = await user.get('/api/credits');
  assert.equal(access.body.mode, 'user');
  assert.equal(access.body.models.length, FREE_USER_MODEL_COUNT);
  assert.deepEqual(access.body.models, [...FREE_USER_MODEL_KEYS]);
  assert.equal(access.body.freeModelCount, 5);
  assert.ok(access.body.models.includes('gemini:3.5-flash-lite'));
  assert.ok(!access.body.models.includes('claude'));
  assert.ok(!access.body.models.includes('llama'));
  assert.equal(access.body.canUseDeveloper, false);
  assert.equal((await user.patch('/api/access-mode').send({mode:'developer',email:'developer@access.test'})).status, 403);
  global.fetch = () => { throw new Error('premium must never call upstream'); };
  const reply = await user.post('/api/chat').send({model:'claude',mode:'developer',userEmail:'developer@access.test',messages:[{role:'user',text:'hello'}]});
  assert.equal(reply.status, 403);
  assert.equal(reply.body.code, 'SUBSCRIPTION_REQUIRED');
});
test('Developer can switch to User preview and back, persisted on the server', async () => {
  assert.equal((await developer.get('/api/credits')).body.unlimited, true);
  assert.equal((await developer.patch('/api/access-mode').send({mode:'user'})).body.models.length, FREE_USER_MODEL_COUNT);
  assert.equal((await developer.get('/api/credits')).body.mode, 'user');
  assert.equal((await developer.post('/api/chat').send({model:'claude',messages:[{role:'user',text:'hello'}]})).status, 403);
  const full = await developer.patch('/api/access-mode').send({mode:'developer'});
  assert.equal(full.status, 200); assert.deepEqual(full.body.models, ['all']);
});
test('Active subscriptions unlock all models; canceled and expired subscriptions do not', async () => {
  const db = app.locals.db.database;
  // Registration already seeds subscription_details; upgrade the existing free row.
  const upgraded = db.prepare(
    "UPDATE subscription_details SET plan=?, billing_interval=?, request_limit=?, period_end=?, status=?, updated_at=? WHERE email=?",
  ).run('week', 'week', 500, '2099-01-01T00:00:00Z', 'active', new Date().toISOString(), 'user@access.test');
  assert.equal(upgraded.changes, 1);
  assert.equal((await user.get('/api/credits')).body.unlimited, true);
  db.prepare("UPDATE subscription_details SET status='canceled' WHERE email=?").run('user@access.test');
  assert.equal((await user.get('/api/credits')).body.canUseDeveloper, false);
  db.prepare("UPDATE subscription_details SET status='active',period_end='2000-01-01T00:00:00Z' WHERE email=?").run('user@access.test');
  assert.equal((await user.get('/api/credits')).body.models.length, FREE_USER_MODEL_COUNT);
});
test('free user cannot invoke premium Gemini variants', async () => {
  global.fetch = () => { throw new Error('premium gemini must not call upstream'); };
  const reply = await user.post('/api/chat').send({
    model: 'gemini',
    variant: '3.1-pro',
    temporary: true,
    messages: [{ role: 'user', text: 'hello' }],
  });
  assert.equal(reply.status, 403);
  assert.equal(reply.body.code, 'SUBSCRIPTION_REQUIRED');
});

test('Smart Router and provider fallback stay within User models', async () => {
  const preview = await user.post('/api/router/preview').send({prompt:'hello'});
  const userModels = (await user.get('/api/credits')).body.models;
  assert.equal(preview.body.model, 'gemini');
  assert.ok(userModels.includes('smart') && userModels.some((key) => String(key).startsWith('gemini:')));
  const models = [];
  global.fetch = async (_url, options) => {
    models.push(JSON.parse(options.body).model);
    if (models.length === 1) return Response.json({error:{message:'busy'}},{status:503});
    return new Response('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\ndata: [DONE]\n\n');
  };
  const reply = await user.post('/api/chat').send({model:'smart',temporary:true,messages:[{role:'user',text:'hello'}]});
  assert.ok(models.length >= 1);
  assert.ok(models.every((model) => !String(model).includes('anthropic')));
  assert.ok(models.every((model) => !String(model).includes('claude')));
  if (reply.status === 200) {
    assert.ok(models.length > 1);
  }
});
