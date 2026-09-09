const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const request = require('supertest');
process.env.NODE_ENV = 'test';
process.env.DB_FILE = path.join(os.tmpdir(), `allmodelai-auth-${process.pid}-${Date.now()}.sqlite`);
const app = require('../app');
const users = require('../src/data/data');
after(() => { app.locals.db.close(); fs.rmSync(process.env.DB_FILE, { force: true }); });

test('register, restore session, logout, and login with normalized email', async () => {
  const agent = request.agent(app);
  const created = await agent.post('/api/auth/register').send({ name: 'Auth User', email: 'Auth@Example.com', password: 'A secure password', rememberMe: true });
  assert.equal(created.status, 201);
  assert.equal(created.body.user.passwordHash, undefined);
  const cookie = created.headers['set-cookie'][0];
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Lax/i);
  assert.match(cookie, /Max-Age=/i);
  assert.equal((await agent.get('/api/auth/session')).body.user.email, 'auth@example.com');
  assert.equal((await agent.post('/api/auth/logout')).status, 204);
  assert.equal((await request(app).get('/api/auth/session').set('Cookie', cookie.split(';')[0])).status, 401);
  assert.equal((await agent.get('/api/auth/session')).status, 401);
  const login = await agent.post('/api/auth/login').send({ email: ' AUTH@example.com ', password: 'A secure password' });
  assert.equal(login.status, 200);
  assert.doesNotMatch(login.headers['set-cookie'][0], /Max-Age=/i);
});

test('wrong passwords cannot bypass authentication, even with the legacy flag', async () => {
  process.env.ALLOW_ANY_PASSWORD = 'true';
  try {
    const result = await request(app).post('/api/auth/login').send({ email: 'alice.johnson@gmail.com', password: 'wrong' });
    assert.equal(result.status, 401);
    assert.equal(result.headers['set-cookie'], undefined);
  } finally { delete process.env.ALLOW_ANY_PASSWORD; }
});

test('passwordless accounts cannot be claimed through login or registration', async () => {
  const account = { id: 90001, name: 'OAuth user', email: 'oauth-only@example.com' };
  users.push(account);
  try {
    assert.equal((await request(app).post('/api/auth/login').send({ email: account.email, password: 'attacker-password' })).status, 401);
    assert.equal((await request(app).post('/api/auth/register').send({ name: 'Attacker', email: account.email, password: 'attacker-password' })).status, 409);
    assert.equal(account.passwordHash, undefined);
  } finally { users.splice(users.indexOf(account), 1); }
});

test('invalid credential types produce validation errors', async () => {
  for (const payload of [{ email: {}, password: 'test' }, { email: 'test@example.com', password: [] }]) {
    assert.equal((await request(app).post('/api/auth/login').send(payload)).status, 400);
    assert.equal((await request(app).post('/api/auth/register').send({ name: 'Test', ...payload })).status, 400);
  }
  assert.equal((await request(app).post('/api/auth/register').send({ name: '   ', email: 'test@example.com', password: 'test' })).status, 400);
  assert.equal((await request(app).get('/api/chat/history')).status, 401);
});

test('concurrent registrations cannot create duplicate accounts', async () => {
  const payload = { name: 'Concurrent', email: 'concurrent@example.com', password: 'A secure password' };
  const results = await Promise.all([request(app).post('/api/auth/register').send(payload), request(app).post('/api/auth/register').send(payload)]);
  assert.deepEqual(results.map((result) => result.status).sort(), [201, 409]);
});
