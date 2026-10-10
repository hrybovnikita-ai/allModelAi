const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.FRONTEND_ORIGIN = 'http://localhost:5173';
process.env.DB_FILE = path.join(os.tmpdir(), `allmodelai-password-enroll-${process.pid}-${Date.now()}.sqlite`);

const app = require('../app');
const admin = require('../src/firebaseAdmin');
const db = app.locals.db.database;

const verified = new Map();
const originalVerify = admin.verifySocialToken;
admin.verifySocialToken = async (token) => {
  if (!verified.has(token)) throw Object.assign(new Error('Rejected'), { code: 'auth/id-token-expired' });
  return verified.get(token);
};

function googleToken(key, email) {
  verified.set(key, {
    uid: `firebase-${key}`,
    auth_time: Math.floor(Date.now() / 1000),
    email,
    email_verified: true,
    name: 'Google User',
    firebase: { sign_in_provider: 'google.com', identities: { 'google.com': [key] } },
  });
  return key;
}

const post = (agent, url, data) => agent
  .post(url)
  .set('Origin', 'http://localhost:5173')
  .set('X-AllModelAI-Auth', '1')
  .send(data);

async function googleLogin(agent, email) {
  const key = `user-${email}`;
  googleToken(key, email);
  const challenge = await post(agent, '/api/auth/firebase/challenge', { intent: 'login' });
  assert.equal(challenge.status, 200);
  return post(agent, '/api/auth/firebase', { idToken: key, state: challenge.body.state, intent: 'login' });
}

after(() => {
  admin.verifySocialToken = originalVerify;
  app.locals.db.close();
  fs.rmSync(process.env.DB_FILE, { force: true });
});

test('Google-only user can enroll a password and sign in with email without merging accounts', async () => {
  const email = 'dual-auth@example.com';
  const agent = request.agent(app);

  const google = await googleLogin(agent, email);
  assert.equal(google.status, 200, JSON.stringify(google.body));
  const userId = google.body.user.id;

  const blocked = await request(app).post('/api/auth/login').send({ email, password: 'new-password-1' });
  assert.equal(blocked.status, 401);
  assert.equal(blocked.body.code, 'PASSWORD_SETUP_REQUIRED');

  const security = await agent.get('/api/auth/account/security');
  assert.equal(security.status, 200);
  assert.equal(security.body.passwordEnabled, false);
  assert.ok(security.body.providers.includes('google.com'));

  const enrolled = await agent.post('/api/auth/account/password').send({
    newPassword: 'secure-password-1',
    confirmPassword: 'secure-password-1',
  });
  assert.equal(enrolled.status, 200);
  assert.equal(enrolled.body.passwordEnabled, true);

  const hashRow = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId);
  assert.ok(hashRow.password_hash);

  await agent.post('/api/auth/logout');

  const passwordLogin = await request.agent(app).post('/api/auth/login').send({
    email,
    password: 'secure-password-1',
  });
  assert.equal(passwordLogin.status, 200);
  assert.equal(passwordLogin.body.user.id, userId);

  const googleAgain = await googleLogin(request.agent(app), email);
  assert.equal(googleAgain.body.user.id, userId);
});

test('password change requires current password when one exists', async () => {
  const email = 'change-pass@example.com';
  const register = await request(app).post('/api/auth/register').send({
    name: 'Password User',
    email,
    password: 'initial-password',
  });
  assert.equal(register.status, 201);
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email, password: 'initial-password' });

  const bad = await agent.post('/api/auth/account/password').send({
    newPassword: 'updated-password',
    confirmPassword: 'updated-password',
  });
  assert.equal(bad.status, 400);

  const wrongCurrent = await agent.post('/api/auth/account/password').send({
    currentPassword: 'wrong',
    newPassword: 'updated-password',
    confirmPassword: 'updated-password',
  });
  assert.equal(wrongCurrent.status, 401);
  assert.equal(wrongCurrent.body.code, 'CURRENT_PASSWORD_INVALID');

  const ok = await agent.post('/api/auth/account/password').send({
    currentPassword: 'initial-password',
    newPassword: 'updated-password',
    confirmPassword: 'updated-password',
  });
  assert.equal(ok.status, 200);
});

test('guest cannot enroll password without session', async () => {
  const result = await request(app).post('/api/auth/account/password').send({
    newPassword: 'secure-password-2',
    confirmPassword: 'secure-password-2',
  });
  assert.equal(result.status, 401);
});
