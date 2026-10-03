const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.DB_FILE = path.join(os.tmpdir(), `allmodelai-pwd-persist-${process.pid}-${Date.now()}.sqlite`);
const app = require('../app');
const users = require('../src/data/data');

test('register → dashboard APIs → logout → login keeps password hash', async () => {
  const agentA = request.agent(app);
  const agentB = request.agent(app);
  const userA = {
    name: 'User A',
    email: 'user-a-persist@example.com',
    password: 'UserAPassword1',
  };
  const userB = {
    name: 'User B',
    email: 'user-b-persist@example.com',
    password: 'UserBPassword2',
  };

  for (const [label, creds, agent] of [
    ['A', userA, agentA],
    ['B', userB, agentB],
  ]) {
    assert.equal(
      (await agent.post('/api/auth/register').send({ ...creds, rememberMe: true })).status,
      201,
      label,
    );
    await agent.get('/api/subscription');
    await agent.get('/api/credits');
    await agent.get('/api/chat/history');
    await agent.post('/api/chat/history').send({
      model: 'gpt',
      messages: [{ role: 'user', text: `${label} private` }],
    });
    await agent.post('/api/auth/logout');
    const db = app.locals.db.database;
    const row = db.prepare(
      'SELECT id, email, password_hash IS NOT NULL AS has_hash FROM users WHERE lower(email) = ?',
    ).get(creds.email);
    assert.ok(row?.has_hash, `${label} password_hash must remain in SQLite after dashboard use`);
    const login = await request(app).post('/api/auth/login').send({
      email: creds.email,
      password: creds.password,
    });
    assert.equal(login.status, 200, `${label} login after logout`);
    assert.equal(login.body.user.email, creds.email);
  }

  for (const email of [userA.email, userB.email]) {
    app.locals.db.database.prepare('DELETE FROM users WHERE lower(email) = ?').run(email);
    const index = users.findIndex((item) => item.email === email);
    if (index !== -1) users.splice(index, 1);
  }
});

test('legacy connection.write cannot erase an existing password hash', async () => {
  const email = 'coalesce@example.com';
  const password = 'CoalesceT12';
  assert.equal(
    (await request(app).post('/api/auth/register').send({ name: 'Coalesce User', email, password })).status,
    201,
  );
  const data = app.locals.db.read();
  const row = data.users.find((user) => user.email === email);
  assert.ok(row?.passwordHash);
  row.passwordHash = null;
  app.locals.db.write(data);
  const login = await request(app).post('/api/auth/login').send({ email, password });
  assert.equal(login.status, 200, login.body.message);
  app.locals.db.database.prepare('DELETE FROM users WHERE lower(email) = ?').run(email);
});
