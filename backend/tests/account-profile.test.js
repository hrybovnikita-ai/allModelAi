const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.FRONTEND_ORIGIN = 'http://localhost:5173';
process.env.DB_FILE = path.join(os.tmpdir(), `allmodelai-profile-${process.pid}-${Date.now()}.sqlite`);

const app = require('../app');

after(() => {
  app.locals.db.close();
  fs.rmSync(process.env.DB_FILE, { force: true });
});

test('authenticated user can update own profile name and avatar only', async () => {
  const email = 'profile-user@example.com';
  const agent = request.agent(app);
  const register = await agent.post('/api/auth/register').send({
    name: 'Before Name',
    email,
    password: 'secure-password-1',
  });
  assert.equal(register.status, 201);
  const userId = register.body.user.id;

  const updated = await agent.patch('/api/auth/account/profile').send({
    name: 'After Name',
    avatar: 'https://cdn.example.com/avatar.png',
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.user.id, userId);
  assert.equal(updated.body.user.name, 'After Name');
  assert.equal(updated.body.user.avatar, 'https://cdn.example.com/avatar.png');
  assert.equal(updated.body.user.email, email);

  const session = await agent.get('/api/auth/session');
  assert.equal(session.status, 200);
  assert.equal(session.body.user.name, 'After Name');

  const other = await request(app).post('/api/auth/register').send({
    name: 'Other User',
    email: 'other-profile@example.com',
    password: 'secure-password-2',
  });
  assert.equal(other.status, 201);
  const otherAgent = request.agent(app);
  await otherAgent.post('/api/auth/login').send({
    email: 'other-profile@example.com',
    password: 'secure-password-2',
  });
  const blocked = await otherAgent.patch('/api/auth/account/profile').send({
    name: 'Hijack',
    avatar: '',
  });
  assert.equal(blocked.status, 200);
  assert.equal(blocked.body.user.email, 'other-profile@example.com');
  assert.notEqual(blocked.body.user.id, userId);

  const original = app.locals.db.database.prepare('SELECT name FROM users WHERE id = ?').get(userId);
  assert.equal(original.name, 'After Name');
});

test('guest cannot update profile', async () => {
  const result = await request(app).patch('/api/auth/account/profile').send({
    name: 'Nope',
  });
  assert.equal(result.status, 401);
});
