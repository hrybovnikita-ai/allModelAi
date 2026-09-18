const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const request = require('supertest');
process.env.NODE_ENV = 'test';
process.env.DB_FILE = path.join(os.tmpdir(), `allmodelai-access-${process.pid}.sqlite`);
process.env.DEVELOPER_EMAILS = 'developer@access.test';
process.env.API_KEY = 'test-gateway';
const app = require('../app');
let user, developer;
const originalFetch = global.fetch;
before(async () => {
  user = request.agent(app); developer = request.agent(app);
  await user.post('/api/auth/register').send({name:'User',email:'user@access.test',password:'secret'});
  await developer.post('/api/auth/register').send({name:'Developer',email:'developer@access.test',password:'secret'});
});
after(() => { global.fetch = originalFetch; app.locals.db.close(); });
test('User has exactly five models and cannot grant Developer access', async () => {
  const access = await user.get('/api/credits');
  assert.equal(access.body.mode, 'user'); assert.equal(access.body.models.length, 8);
  assert.equal(access.body.canUseDeveloper, false);
  assert.equal((await user.patch('/api/access-mode').send({mode:'developer',email:'developer@access.test'})).status, 403);
  global.fetch = () => { throw new Error('premium must never call upstream'); };
  const reply = await user.post('/api/chat').send({model:'claude',mode:'developer',userEmail:'developer@access.test',messages:[{role:'user',text:'hello'}]});
  assert.equal(reply.status, 403);
});
test('Developer can switch to User preview and back, persisted on the server', async () => {
  assert.equal((await developer.get('/api/credits')).body.unlimited, true);
  assert.equal((await developer.patch('/api/access-mode').send({mode:'user'})).body.models.length, 8);
  assert.equal((await developer.get('/api/credits')).body.mode, 'user');
  assert.equal((await developer.post('/api/chat').send({model:'claude',messages:[{role:'user',text:'hello'}]})).status, 403);
  const full = await developer.patch('/api/access-mode').send({mode:'developer'});
  assert.equal(full.status, 200); assert.deepEqual(full.body.models, ['all']);
});
test('Active subscriptions unlock all models; canceled and expired subscriptions do not', async () => {
  const db = app.locals.db.database;
  db.prepare("INSERT INTO subscription_details (email,plan,billing_interval,request_limit,period_end,status,updated_at) VALUES (?,?,?,?,?,?,?)").run('user@access.test','week','week',500,'2099-01-01T00:00:00Z','active',new Date().toISOString());
  assert.equal((await user.get('/api/credits')).body.unlimited, true);
  db.prepare("UPDATE subscription_details SET status='canceled' WHERE email=?").run('user@access.test');
  assert.equal((await user.get('/api/credits')).body.canUseDeveloper, false);
  db.prepare("UPDATE subscription_details SET status='active',period_end='2000-01-01T00:00:00Z' WHERE email=?").run('user@access.test');
  assert.equal((await user.get('/api/credits')).body.models.length, 8);
});
test('Smart Router and provider fallback stay within User models', async () => {
  const preview = await user.post('/api/router/preview').send({prompt:'hello'});
  const userModels = (await user.get('/api/credits')).body.models; assert.ok(userModels.includes(preview.body.model));
  const models = [];
  global.fetch = async (_url, options) => {
    models.push(JSON.parse(options.body).model);
    if (models.length === 1) return Response.json({error:{message:'busy'}},{status:503});
    return new Response('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\ndata: [DONE]\n\n');
  };
  const reply = await user.post('/api/chat').send({model:'smart',temporary:true,messages:[{role:'user',text:'hello'}]});
  assert.equal(reply.status, 200);
  assert.ok(models.length > 1);
  assert.ok(models.every(model => !model.includes('anthropic')));
});
