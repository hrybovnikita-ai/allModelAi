const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.CLERK_AUTH_ENABLED = 'true';
process.env.CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY || 'sk_test_clerk_auth_suite';
process.env.DB_FILE = path.join(os.tmpdir(), `allmodelai-clerk-${process.pid}-${Date.now()}.sqlite`);

const app = require('../app');

after(() => {
  try { fs.rmSync(process.env.DB_FILE, { force: true }); } catch { /* ignore */ }
});

function agent() {
  return request.agent(app);
}

function allow(token, claims) {
  app.locals.verifyClerkSession = async (received) => {
    if (received !== token) {
      const error = new Error('invalid');
      error.status = 401;
      error.code = 'CLERK_SESSION_INVALID';
      throw error;
    }
    return claims;
  };
}

test('public clerk-auth status reflects the feature flag without exposing secrets', async () => {
  process.env.CLERK_AUTH_ENABLED = 'false';
  const off = await request(app).get('/api/public/clerk-auth');
  assert.equal(off.status, 200);
  assert.equal(off.body.enabled, false);
  assert.equal(off.body.secretKey, undefined);
  process.env.CLERK_AUTH_ENABLED = 'true';
  const on = await request(app).get('/api/public/clerk-auth');
  assert.equal(on.status, 200);
  assert.equal(on.body.enabled, true);
});

test('clerk exchange rejects an expired session token', async () => {
  app.locals.verifyClerkSession = async () => {
    const error = new Error('expired');
    error.status = 401;
    error.code = 'CLERK_SESSION_INVALID';
    throw error;
  };
  const response = await request(app)
    .post('/api/auth/clerk/exchange')
    .set('Origin', 'http://localhost:5173')
    .set('X-AllModelAI-Auth', '1')
    .set('Authorization', 'Bearer expired-token')
    .send({});
  assert.equal(response.status, 401);
  assert.equal(response.body.code, 'CLERK_SESSION_INVALID');
});

test('protected API rejects requests without a session after clerk exchange cookie is cleared', async () => {
  allow('session-token', { userId: 'clerk_user_session', email: 'session@example.com', name: 'Session User' });
  const client = agent();
  const exchange = await client
    .post('/api/auth/clerk/exchange')
    .set('Origin', 'http://localhost:5173')
    .set('X-AllModelAI-Auth', '1')
    .set('Authorization', 'Bearer session-token')
    .send({});
  assert.equal(exchange.status, 200);
  const authed = await client.get('/api/auth/session');
  assert.equal(authed.body.user.email, 'session@example.com');
  await client.post('/api/auth/logout');
  const denied = await request(app).get('/api/ai/memory');
  assert.equal(denied.status, 401);
});

test('clerk exchange stays hidden when the feature flag is off', async () => {
  process.env.CLERK_AUTH_ENABLED = 'false';
  const response = await request(app)
    .post('/api/auth/clerk/exchange')
    .set('Origin', 'http://localhost:5173')
    .set('X-AllModelAI-Auth', '1')
    .set('Authorization', 'Bearer clerk-token')
    .send({});
  assert.equal(response.status, 404);
  process.env.CLERK_AUTH_ENABLED = 'true';
});

test('clerk exchange rejects missing and forged tokens', async () => {
  allow('good-token', { userId: 'clerk_user_1', email: 'clerk1@example.com', name: 'Clerk One' });
  const missing = await request(app)
    .post('/api/auth/clerk/exchange')
    .set('Origin', 'http://localhost:5173')
    .set('X-AllModelAI-Auth', '1')
    .send({});
  assert.equal(missing.status, 401);
  const forged = await request(app)
    .post('/api/auth/clerk/exchange')
    .set('Origin', 'http://localhost:5173')
    .set('X-AllModelAI-Auth', '1')
    .set('Authorization', 'Bearer forged')
    .send({});
  assert.equal(forged.status, 401);
  assert.equal(forged.headers['set-cookie'], undefined);
});

test('new clerk user gets a free session and a repeat exchange reuses the same account', async () => {
  allow('good-token', { userId: 'clerk_user_1', email: 'clerk1@example.com', name: 'Clerk One' });
  const client = agent();
  const created = await client
    .post('/api/auth/clerk/exchange')
    .set('Origin', 'http://localhost:5173')
    .set('X-AllModelAI-Auth', '1')
    .set('Authorization', 'Bearer good-token')
    .send({});
  assert.equal(created.status, 200);
  assert.equal(created.body.created, true);
  assert.equal(created.body.user.email, 'clerk1@example.com');
  assert.equal(created.body.user.role, 'user');
  assert.equal(created.body.user.passwordHash, undefined);
  const session = await client.get('/api/auth/session');
  assert.equal(session.body.user.email, 'clerk1@example.com');
  const again = await client
    .post('/api/auth/clerk/exchange')
    .set('Origin', 'http://localhost:5173')
    .set('X-AllModelAI-Auth', '1')
    .set('Authorization', 'Bearer good-token')
    .send({});
  assert.equal(again.status, 200);
  assert.equal(again.body.created, false);
  assert.equal(again.body.user.id, created.body.user.id);
  const identities = app.locals.db.database.prepare(
    'SELECT COUNT(*) AS count FROM social_identities WHERE provider = ? AND subject = ?',
  ).get('clerk', 'clerk_user_1');
  assert.equal(identities.count, 1);
});

test('clerk does not take over an existing Firebase email', async () => {
  const db = app.locals.db.database;
  db.prepare(
    'INSERT INTO users (name, email, password_hash, email_verified) VALUES (?, ?, ?, 1)',
  ).run('Firebase user', 'shared@example.com', 'hash');
  allow('other-token', { userId: 'clerk_user_2', email: 'shared@example.com', name: 'Clerk Two' });
  const response = await request(app)
    .post('/api/auth/clerk/exchange')
    .set('Origin', 'http://localhost:5173')
    .set('X-AllModelAI-Auth', '1')
    .set('Authorization', 'Bearer other-token')
    .send({});
  assert.equal(response.status, 409);
  assert.equal(response.body.code, 'CLERK_LINK_REQUIRED');
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM social_identities WHERE subject = ?').get('clerk_user_2').count, 0);
});

test('two clerk users stay separate', async () => {
  allow('token-a', { userId: 'clerk_a', email: 'a@example.com', name: 'A' });
  const first = await request(app)
    .post('/api/auth/clerk/exchange')
    .set('Origin', 'http://localhost:5173')
    .set('X-AllModelAI-Auth', '1')
    .set('Authorization', 'Bearer token-a')
    .send({});
  allow('token-b', { userId: 'clerk_b', email: 'b@example.com', name: 'B' });
  const second = await request(app)
    .post('/api/auth/clerk/exchange')
    .set('Origin', 'http://localhost:5173')
    .set('X-AllModelAI-Auth', '1')
    .set('Authorization', 'Bearer token-b')
    .send({});
  assert.notEqual(first.body.user.id, second.body.user.id);
  assert.equal(first.body.user.role, 'user');
  assert.equal(second.body.user.role, 'user');
});
