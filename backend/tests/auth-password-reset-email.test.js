const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.EXPOSE_ACCOUNT_TOKENS = 'true';
process.env.FRONTEND_ORIGIN = 'http://localhost:5173';
process.env.DB_FILE = path.join(os.tmpdir(), `allmodelai-pwd-reset-${process.pid}-${Date.now()}.sqlite`);

const app = require('../app');
const transactionalEmail = require('../src/transactionalEmail');

after(() => {
  app.locals.db.close();
  fs.rmSync(process.env.DB_FILE, { force: true });
});

test('password reset request is generic and confirm sets password then invalidates token', async () => {
  const email = 'reset-user@example.com';
  const register = await request(app).post('/api/auth/register').send({
    name: 'Reset User',
    email,
    password: 'initial-password-1',
  });
  assert.equal(register.status, 201);

  const unknown = await request(app).post('/api/auth/password-reset/request').send({
    email: 'missing-user@example.com',
  });
  assert.equal(unknown.status, 200);
  assert.match(unknown.body.message, /if the account exists/i);
  assert.equal(unknown.body.token, undefined);

  const originalSend = transactionalEmail.sendPasswordResetEmail;
  const originalConfigured = transactionalEmail.isTransactionalEmailConfigured;
  let sentPayload = null;
  transactionalEmail.isTransactionalEmailConfigured = () => true;
  transactionalEmail.sendPasswordResetEmail = async (payload) => {
    sentPayload = payload;
    return { sent: true };
  };

  try {
    const requested = await request(app).post('/api/auth/password-reset/request').send({ email });
    assert.equal(requested.status, 200);
    assert.match(requested.body.message, /check your email|if the account exists/i);
    assert.ok(requested.body.token);
    assert.equal(sentPayload?.email, email);
    assert.ok(sentPayload?.token);

    const confirmed = await request(app).post('/api/auth/password-reset/confirm').send({
      token: requested.body.token,
      password: 'fresh-password-9',
      confirmPassword: 'fresh-password-9',
    });
    assert.equal(confirmed.status, 200);

    const reused = await request(app).post('/api/auth/password-reset/confirm').send({
      token: requested.body.token,
      password: 'another-password-9',
      confirmPassword: 'another-password-9',
    });
    assert.equal(reused.status, 400);

    const login = await request(app).post('/api/auth/login').send({
      email,
      password: 'fresh-password-9',
    });
    assert.equal(login.status, 200);
  } finally {
    transactionalEmail.sendPasswordResetEmail = originalSend;
    transactionalEmail.isTransactionalEmailConfigured = originalConfigured;
  }
});

test('expired password reset token is rejected', async () => {
  const email = 'expired-reset@example.com';
  await request(app).post('/api/auth/register').send({
    name: 'Expired Reset',
    email,
    password: 'initial-password-2',
  });

  const requested = await request(app).post('/api/auth/password-reset/request').send({ email });
  assert.equal(requested.status, 200);
  assert.ok(requested.body.token);

  const db = app.locals.db.database;
  const { hashValue } = require('../src/db/postgresHttpProduction');
  db.prepare('UPDATE account_tokens SET expires_at = ? WHERE token_hash = ?').run(
    Date.now() - 1000,
    hashValue(requested.body.token),
  );

  const confirmed = await request(app).post('/api/auth/password-reset/confirm').send({
    token: requested.body.token,
    password: 'too-late-password',
    confirmPassword: 'too-late-password',
  });
  assert.equal(confirmed.status, 400);
  assert.match(confirmed.body.message, /invalid or has expired/i);
});

test('concurrent reset submissions consume the token once and revoke the old session', async () => {
  const agent = request.agent(app);
  const email = 'concurrent-reset@example.com';
  const registered = await agent.post('/api/auth/register').send({ name: 'Reset', email, password: 'InitialPassword1!' });
  assert.equal(registered.status, 201);
  const requested = await request(app).post('/api/auth/password-reset/request').send({ email });
  const responses = await Promise.all(['NewPasswordOne1!', 'NewPasswordTwo2!'].map(password =>
    request(app).post('/api/auth/password-reset/confirm').send({ token: requested.body.token, password })));
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 400]);
  assert.equal((await agent.get('/api/auth/session')).body.user, null);
});

test('google-only login without password stays generic then enroll works', async () => {
  const admin = require('../src/firebaseAdmin');
  const verified = new Map();
  const originalVerify = admin.verifySocialToken;
  admin.verifySocialToken = async (token) => {
    if (!verified.has(token)) throw Object.assign(new Error('Rejected'), { code: 'auth/id-token-expired' });
    return verified.get(token);
  };

  try {
    const email = 'google-reset-enroll@example.com';
    const key = 'g-reset-enroll';
    verified.set(key, {
      uid: `firebase-${key}`,
      auth_time: Math.floor(Date.now() / 1000),
      email,
      email_verified: true,
      name: 'Google Reset',
      firebase: { sign_in_provider: 'google.com', identities: { 'google.com': [key] } },
    });
    const agent = request.agent(app);
    const challenge = await agent.post('/api/auth/firebase/challenge')
      .set('Origin', 'http://localhost:5173')
      .set('X-AllModelAI-Auth', '1')
      .send({ intent: 'login' });
    assert.equal(challenge.status, 200);
    const google = await agent.post('/api/auth/firebase')
      .set('Origin', 'http://localhost:5173')
      .set('X-AllModelAI-Auth', '1')
      .send({ idToken: key, state: challenge.body.state, intent: 'login' });
    assert.equal(google.status, 200);
    await agent.post('/api/auth/logout');

    const blocked = await request(app).post('/api/auth/login').send({
      email,
      password: 'not-set-yet-1',
    });
    assert.equal(blocked.status, 401);
    assert.equal(blocked.body.code, 'PASSWORD_SETUP_REQUIRED');
    assert.match(blocked.body.message, /google/i);

    const requested = await request(app).post('/api/auth/password-reset/request').send({ email });
    assert.equal(requested.status, 200);
    assert.ok(requested.body.token);

    const confirmed = await request(app).post('/api/auth/password-reset/confirm').send({
      token: requested.body.token,
      password: 'allmodel-password-1',
      confirmPassword: 'allmodel-password-1',
    });
    assert.equal(confirmed.status, 200);

    const login = await request(app).post('/api/auth/login').send({
      email,
      password: 'allmodel-password-1',
    });
    assert.equal(login.status, 200);
    assert.equal(login.body.user.id, google.body.user.id);
  } finally {
    admin.verifySocialToken = originalVerify;
  }
});
