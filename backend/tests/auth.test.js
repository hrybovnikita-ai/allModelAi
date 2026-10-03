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
after(() => { try { fs.rmSync(process.env.DB_FILE, { force: true }); } catch {} });

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
  assert.match(login.headers['set-cookie'][0], /Max-Age=2592000/i);
  const temporary = await agent.post('/api/auth/login').send({ email: 'auth@example.com', password: 'A secure password', rememberMe: false });
  assert.doesNotMatch(temporary.headers['set-cookie'][0], /Max-Age=/i);
});

test('wrong passwords cannot bypass authentication in development mode', async () => {
  const previous = process.env.NODE_ENV;
  delete process.env.NODE_ENV;
  process.env.ALLOW_ANY_PASSWORD = 'true';
  try {
    await request(app).post('/api/auth/register').send({
      name: 'Alice Johnson',
      email: 'alice.johnson@gmail.com',
      password: 'alice-correct-password',
    });
    const result = await request(app).post('/api/auth/login').send({
      email: 'alice.johnson@gmail.com',
      password: 'wrong-password-1',
    });
    assert.equal(result.status, 401);
    assert.equal(result.headers['set-cookie'], undefined);
  } finally {
    delete process.env.ALLOW_ANY_PASSWORD;
    app.locals.db.database.prepare('DELETE FROM users WHERE lower(email) = ?').run('alice.johnson@gmail.com');
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});

test('passwordless accounts cannot be claimed through login or registration', async () => {
  const email = 'oauth-only@example.com';
  const db = app.locals.db.database;
  const id = Number(db.prepare(
    'INSERT INTO users (name, email, password_hash, email_verified) VALUES (?, ?, NULL, 1)',
  ).run('OAuth user', email).lastInsertRowid);
  try {
    const blocked = await request(app).post('/api/auth/login').send({ email, password: 'attacker-password' });
    assert.equal(blocked.status, 401);
    assert.equal(blocked.body.code, 'PASSWORD_SETUP_REQUIRED');
    assert.equal((await request(app).post('/api/auth/register').send({
      name: 'Attacker',
      email,
      password: 'attacker-password',
    })).status, 409);
    assert.equal(db.prepare('SELECT password_hash FROM users WHERE id = ?').get(id).password_hash, null);
  } finally {
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
  }
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

test('login email normalization trims and lowercases only', async () => {
  const { normalizeLoginEmail } = require('../src/authHelpers');
  assert.equal(normalizeLoginEmail('  Alice@Example.COM '), 'alice@example.com');
});

test('login does not map one email address to another', async () => {
  const password = 'ExactEmailPass1';
  const canonical = 'exact-owner@example.com';
  const typo = 'exact-ownr@example.com';
  assert.equal((await request(app).post('/api/auth/register').send({
    name: 'Exact Owner',
    email: canonical,
    password,
  })).status, 201);
  assert.equal((await request(app).post('/api/auth/login').send({
    email: typo,
    password,
  })).status, 401);
  const agent = request.agent(app);
  assert.equal((await agent.post('/api/auth/login').send({ email: canonical, password })).status, 200);
  app.locals.db.database.prepare('DELETE FROM users WHERE lower(email) = ?').run(canonical);
  const index = users.findIndex((item) => item.email.toLowerCase() === canonical);
  if (index !== -1) users.splice(index, 1);
});

test('production login does not auto-register unknown accounts', async () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const result = await request(app).post('/api/auth/login').send({
      email: 'never-registered@example.com',
      password: 'some-password',
    });
    assert.equal(result.status, 401);
    assert.equal(result.body.message, 'Incorrect email or password');
    assert.equal(app.locals.db.database.prepare('SELECT id FROM users WHERE lower(email) = ?').get('never-registered@example.com'), undefined);
  } finally {
    process.env.NODE_ENV = previous;
  }
});

test('login cannot create users; registration plus login works', async () => {
  const agent = request.agent(app);
  const email = 'registered-login@example.com';
  const password = 'RegisteredLogin1';
  const db = app.locals.db.database;
  const before = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  assert.equal((await request(app).post('/api/auth/login').send({ email, password })).status, 401);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users').get().n, before);
  assert.equal((await agent.post('/api/auth/register').send({
    name: 'Registered User',
    email,
    password,
  })).status, 201);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users').get().n, before + 1);
  const loginRes = await agent.post('/api/auth/login').send({ email, password });
  assert.equal(loginRes.status, 200);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users').get().n, before + 1);
  assert.equal((await agent.get('/api/auth/session')).body.user.email, email);
  db.prepare('DELETE FROM users WHERE lower(email) = ?').run(email);
  const authIndex = users.findIndex((u) => u.email === 'auth@example.com');
  if (authIndex !== -1) users.splice(authIndex, 1);
  const concurrentIndex = users.findIndex((u) => u.email === 'concurrent@example.com');
  if (concurrentIndex !== -1) users.splice(concurrentIndex, 1);
});


test('stalled welcome email does not prevent registration or session restoration', async () => {
  const previousFetch = global.fetch;
  const previousKey = process.env.RESEND_API_KEY;
  const previousFrom = process.env.EMAIL_FROM;
  process.env.RESEND_API_KEY = 'test-email-key';
  process.env.EMAIL_FROM = 'welcome@example.com';
  let aborted = false;
  global.fetch = async (url, options) => {
    assert.equal(url, 'https://api.resend.com/emails');
    assert.ok(options.signal);
    return new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        aborted = true;
        reject(options.signal.reason);
      }, { once: true });
    });
  };
  try {
    const client = request.agent(app);
    const response = await client.post('/api/auth/register')
      .send({ name: 'Any Name', email: 'welcome-timeout@example.com', password: 'welcome-pass' })
      .timeout({ response: 6000 });
    assert.equal(response.status, 201);
    assert.equal(aborted, true);
    assert.equal(response.body.welcomeEmail.reason, 'delivery_failed');
    assert.equal((await client.get('/api/auth/session')).body.user.email, 'welcome-timeout@example.com');
    assert.equal((await client.get('/api/chat/history')).status, 200);
  } finally {
    global.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previousKey;
    if (previousFrom === undefined) delete process.env.EMAIL_FROM;
    else process.env.EMAIL_FROM = previousFrom;
  }
});