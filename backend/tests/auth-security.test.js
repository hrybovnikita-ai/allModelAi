const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.DB_FILE = path.join(os.tmpdir(), `allmodelai-auth-sec-${process.pid}-${Date.now()}.sqlite`);
const app = require('../app');

test('missing account cannot login in development runtime', async () => {
  const previous = process.env.NODE_ENV;
  delete process.env.NODE_ENV;
  try {
    const db = app.locals.db.database;
    const before = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
    const res = await request(app).post('/api/auth/login').send({
      email: 'ghost-dev@example.com',
      password: 'some-password-1',
    });
    assert.equal(res.status, 401);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users').get().n, before);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});

test('development flags cannot auto-create users or skip password checks', async () => {
  const previous = process.env.NODE_ENV;
  delete process.env.NODE_ENV;
  process.env.ALLOW_ANY_PASSWORD = 'true';
  process.env.ENABLE_LOGIN_AUTO_REGISTER = 'true';
  try {
    const db = app.locals.db.database;
    const before = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
    const res = await request(app).post('/api/auth/login').send({
      email: 'dev-bypass@example.com',
      password: 'any-password-1',
    });
    assert.equal(res.status, 401);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users').get().n, before);
  } finally {
    delete process.env.ALLOW_ANY_PASSWORD;
    delete process.env.ENABLE_LOGIN_AUTO_REGISTER;
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});

test('successful login does not increase user count', async () => {
  const agent = request.agent(app);
  const email = `login-count-${Date.now()}@example.com`;
  const password = 'LoginCountPass1';
  const db = app.locals.db.database;
  assert.equal((await agent.post('/api/auth/register').send({ name: 'Count User', email, password })).status, 201);
  const afterRegister = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  assert.equal((await agent.post('/api/auth/login').send({ email, password })).status, 200);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users').get().n, afterRegister);
});

test('loadAuthUserByEmail reads SQL only', () => {
  const { loadAuthUserByEmail } = require('../src/authUser');
  const db = app.locals.db.database;
  const email = `sql-only-${Date.now()}@example.com`;
  const id = Number(db.prepare(
    'INSERT INTO users (name, email, password_hash, email_verified) VALUES (?, ?, ?, 1)',
  ).run('SQL Only', email, 'salt:abc').lastInsertRowid);
  try {
    assert.equal(loadAuthUserByEmail(db, email)?.id, id);
  } finally {
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
  }
});
