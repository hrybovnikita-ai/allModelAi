const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const os = require('node:os');
const path = require('node:path');
process.env.NODE_ENV = 'test';
delete process.env.DATABASE_URL;
process.env.DB_FILE = path.join(os.tmpdir(), `amai-session-contract-${process.pid}-${Date.now()}.sqlite`);
const app = require('../app');
const { createSessionToken } = require('../src/sessionToken');
const { hashToken } = require('../src/sessionAuth');
const db = app.locals.db.database;
after(() => app.locals.db.close());

function fixture() {
  const email = `contract-${Math.random()}@example.com`;
  const id = Number(db.prepare('INSERT INTO users (name, email, email_verified) VALUES (?, ?, 1)').run('Contract', email).lastInsertRowid);
  const token = createSessionToken();
  db.prepare('INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(hashToken(token), id, Date.now() + 60000);
  return { id, email, token };
}

test('Firebase identity alone cannot report a session rejected by protected routes', async () => {
  const user = fixture();
  const firebase = require('../src/firebaseAdmin');
  const oldVerify = firebase.verifySocialToken;
  firebase.verifySocialToken = async () => ({ email: user.email, email_verified: true });
  try {
    const result = await request(app).get('/api/auth/session').set('Authorization', 'Bearer firebase-test-token');
    assert.equal(result.body.authenticated, false);
    assert.equal(result.body.user, null);
    assert.match(result.headers['cache-control'], /no-store/);
    assert.equal((await request(app).get('/api/chat/history').set('Authorization', 'Bearer firebase-test-token')).status, 401);
  } finally { firebase.verifySocialToken = oldVerify; }
});

test('logout revokes different cookie and header sessions, expires cookie, and preserves users', async () => {
  const cookie = fixture();
  const header = fixture();
  const result = await request(app).post('/api/auth/logout')
    .set('Origin', 'https://all-model-ai.com')
    .set('Cookie', `allmodelai_session=${cookie.token}`)
    .set('X-AllModelAI-Session', header.token);
  assert.equal(result.status, 204);
  assert.match(result.headers['set-cookie'].join(';'), /allmodelai_session=;.*Path=\/.*Expires=.*HttpOnly/i);
  assert.equal(result.headers['access-control-allow-origin'], 'https://all-model-ai.com');
  assert.equal(result.headers['access-control-allow-credentials'], 'true');
  for (const user of [cookie, header]) {
    assert.equal(db.prepare('SELECT token_hash FROM auth_sessions WHERE token_hash = ?').get(hashToken(user.token)), undefined);
    assert.ok(db.prepare('SELECT id FROM users WHERE id = ?').get(user.id));
    assert.equal((await request(app).get('/api/auth/session').set('Cookie', `allmodelai_session=${user.token}`)).body.authenticated, false);
  }
});

test('expired sessions are anonymous and cannot access protected APIs', async () => {
  const user = fixture();
  db.prepare('UPDATE auth_sessions SET expires_at = ? WHERE token_hash = ?').run(Date.now() - 1, hashToken(user.token));
  const cookie = `allmodelai_session=${user.token}`;
  assert.equal((await request(app).get('/api/auth/session').set('Cookie', cookie)).body.authenticated, false);
  assert.equal((await request(app).get('/api/chat/history').set('Cookie', cookie)).status, 401);
});

test('logout database failure expires the browser cookie but reports failure', async () => {
  const oldDb = app.locals.db;
  app.locals.db = { database: { prepare() { throw new Error('test database unavailable'); } } };
  try {
    const result = await request(app).post('/api/auth/logout').set('Cookie', `allmodelai_session=${createSessionToken()}`);
    assert.equal(result.status, 500);
    assert.match(result.headers['set-cookie'].join(';'), /allmodelai_session=;/);
  } finally { app.locals.db = oldDb; }
});
