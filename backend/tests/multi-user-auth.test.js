const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.DB_FILE = path.join(os.tmpdir(), `allmodelai-multi-auth-${process.pid}-${Date.now()}.sqlite`);
const app = require('../app');
const users = require('../src/data/data');

after(() => {
  try {
    fs.rmSync(process.env.DB_FILE, { force: true });
  } catch {
    /* ignore */
  }
});

const userA = {
  name: 'Alice',
  email: 'alice@example.com',
  password: 'AlicePassword123',
};
const userB = {
  name: 'John',
  email: 'john@example.com',
  password: 'JohnPassword456',
};

function cleanupEmails(...emails) {
  const db = app.locals.db.database;
  for (const email of emails) {
    db.prepare('DELETE FROM users WHERE lower(email) = ?').run(email.toLowerCase());
    const index = users.findIndex((item) => item.email?.toLowerCase() === email.toLowerCase());
    if (index !== -1) users.splice(index, 1);
  }
}

test('multi-user auth: register, login, sessions, logout, isolation', async () => {
  const agentA = request.agent(app);
  const agentB = request.agent(app);

  const regA = await agentA.post('/api/auth/register').send({ ...userA, rememberMe: true });
  assert.equal(regA.status, 201);
  assert.equal(regA.body.user.email, userA.email);
  assert.equal(regA.body.user.passwordHash, undefined);

  const regB = await agentB.post('/api/auth/register').send({ ...userB, rememberMe: true });
  assert.equal(regB.status, 201);
  assert.equal(regB.body.user.email, userB.email);
  assert.notEqual(regA.body.user.id, regB.body.user.id);

  const dup = await request(app).post('/api/auth/register').send({ ...userA, rememberMe: false });
  assert.equal(dup.status, 409);

  await agentA.get('/api/subscription');
  await agentB.get('/api/subscription');

  await agentA.post('/api/auth/logout');
  await agentB.post('/api/auth/logout');

  const dbAfterLogout = app.locals.db.database;
  for (const creds of [userA, userB]) {
    const row = dbAfterLogout.prepare(
      'SELECT id, email, password_hash IS NOT NULL AS has_hash FROM users WHERE lower(email) = ?',
    ).get(creds.email);
    assert.ok(row?.has_hash, `${creds.email} must still exist with password after logout`);
  }

  const loginA = await agentA.post('/api/auth/login').send({
    email: userA.email,
    password: userA.password,
    rememberMe: true,
  });
  assert.equal(loginA.status, 200);
  assert.equal(loginA.body.user.email, userA.email);

  const loginB = await agentB.post('/api/auth/login').send({
    email: userB.email,
    password: userB.password,
    rememberMe: true,
  });
  assert.equal(loginB.status, 200);
  assert.equal(loginB.body.user.email, userB.email);

  const badPass = await request(app).post('/api/auth/login').send({
    email: userA.email,
    password: 'wrong-password',
  });
  assert.equal(badPass.status, 401);
  assert.equal(badPass.body.message, 'Incorrect email or password');

  const unknown = await request(app).post('/api/auth/login').send({
    email: 'nobody@example.com',
    password: 'SomePassword1',
  });
  assert.equal(unknown.status, 401);
  assert.equal(unknown.body.message, 'Incorrect email or password');

  const meA = await agentA.get('/api/auth/me');
  assert.equal(meA.status, 200);
  assert.equal(meA.body.user.email, userA.email);
  assert.equal(meA.body.user.id, loginA.body.user.id);

  const meB = await agentB.get('/api/auth/me');
  assert.equal(meB.status, 200);
  assert.equal(meB.body.user.email, userB.email);
  assert.equal(meB.body.user.id, loginB.body.user.id);

  const directory = await request(app).get('/api/users');
  assert.equal(directory.status, 200);
  assert.equal(directory.body.users.length, 2);
  assert.ok(directory.body.users.some((row) => row.name === userA.name));
  assert.ok(directory.body.users.some((row) => row.name === userB.name));

  const chatA = await agentA.post('/api/chat/history').send({
    model: 'gpt',
    messages: [{ role: 'user', text: 'Alice private thread' }],
  });
  assert.equal(chatA.status, 201);
  const chatIdA = chatA.body.id;

  const historyB = await agentB.get('/api/chat/history');
  assert.equal(historyB.status, 200);
  assert.equal(historyB.body.some((item) => item.id === chatIdA), false);

  const cookieA = loginA.headers['set-cookie']?.[0]?.split(';')[0];
  assert.ok(cookieA);
  await agentA.post('/api/auth/logout');
  assert.equal((await request(app).get('/api/auth/me').set('Cookie', cookieA)).status, 401);

  cleanupEmails(userA.email, userB.email);
});
