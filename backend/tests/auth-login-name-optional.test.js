const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.FRONTEND_ORIGIN = 'http://localhost:5173';
process.env.DB_FILE = path.join(os.tmpdir(), `allmodelai-login-name-${process.pid}-${Date.now()}.sqlite`);
delete process.env.REQUIRE_EMAIL_VERIFICATION;

const app = require('../app');

after(() => {
  app.locals.db.close();
  fs.rmSync(process.env.DB_FILE, { force: true });
});

test('registration with name/email/password then login with optional name', async () => {
  const email = 'named-login@example.com';
  const password = 'SecurePass123';
  const register = await request(app).post('/api/auth/register').send({
    name: 'Named User',
    email,
    password,
  });
  assert.equal(register.status, 201);
  assert.equal(register.body.user.email, email);
  assert.equal(register.body.needsEmailVerification, undefined);

  await request(app).post('/api/auth/logout');

  const login = await request.agent(app).post('/api/auth/login').send({
    name: 'Preferred Display',
    email,
    password,
    rememberMe: true,
  });
  assert.equal(login.status, 200);
  assert.equal(login.body.user.email, email);
  assert.equal(login.body.user.name, 'Preferred Display');

  const session = await request.agent(app)
    .post('/api/auth/login')
    .send({ email, password })
    .then((res) => res.headers['set-cookie'])
    .then((cookies) => request(app).get('/api/auth/session').set('Cookie', cookies));
  assert.equal(session.status, 200);
  assert.equal(session.body.authenticated, true);
});

test('legacy unverified password accounts can still login unless REQUIRE_EMAIL_VERIFICATION=true', async () => {
  const email = 'legacy-unverified@example.com';
  const password = 'LegacyPass123';
  const register = await request(app).post('/api/auth/register').send({
    name: 'Legacy',
    email,
    password,
  });
  assert.equal(register.status, 201);
  const userId = register.body.user.id;
  app.locals.db.database.prepare('UPDATE users SET email_verified = 0 WHERE id = ?').run(userId);

  const login = await request(app).post('/api/auth/login').send({ email, password });
  assert.equal(login.status, 200);

  const previous = process.env.REQUIRE_EMAIL_VERIFICATION;
  process.env.REQUIRE_EMAIL_VERIFICATION = 'true';
  try {
    const blocked = await request(app).post('/api/auth/login').send({ email, password });
    assert.equal(blocked.status, 403);
    assert.equal(blocked.body.code, 'EMAIL_NOT_VERIFIED');
  } finally {
    if (previous === undefined) delete process.env.REQUIRE_EMAIL_VERIFICATION;
    else process.env.REQUIRE_EMAIL_VERIFICATION = previous;
  }
});

test('invalid credentials stay generic 401', async () => {
  const bad = await request(app).post('/api/auth/login').send({
    email: 'missing@example.com',
    password: 'wrong-password',
  });
  assert.equal(bad.status, 401);
  assert.equal(bad.body.code, 'INVALID_CREDENTIALS');
  assert.match(bad.body.message, /incorrect email or password/i);
});
