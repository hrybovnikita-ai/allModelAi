const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const request = require('supertest');
process.env.NODE_ENV = 'test';
process.env.FRONTEND_ORIGIN = 'http://localhost:5173';
process.env.DB_FILE = path.join(os.tmpdir(), `allmodelai-social-${process.pid}-${Date.now()}.sqlite`);
const app = require('../app');
const admin = require('../src/firebaseAdmin');
const githubSocialEmail = require('../src/githubSocialEmail');
const db = app.locals.db.database;
const originalGitHubProfile = githubSocialEmail.profileFromGitHubAccessToken;
const verified = new Map();
// Mock only the external verification boundary. Real credentials are never used by tests.
const original = admin.verifySocialToken;
admin.verifySocialToken = async token => {
  if (!verified.has(token)) throw Object.assign(new Error('Rejected'), { code: 'auth/id-token-expired' });
  return verified.get(token);
};
after(() => {
    admin.verifySocialToken = original;
    githubSocialEmail.profileFromGitHubAccessToken = originalGitHubProfile;
    app.locals.db.close();
    fs.rmSync(process.env.DB_FILE, { force: true });
});
function token(key, overrides = {}) {
  verified.set(key, { uid: `firebase-${key}`, auth_time: Math.floor(Date.now() / 1000), email: `${key}@example.com`, email_verified: true,
    name: 'Provider User', picture: 'https://example.com/avatar.png', firebase: { sign_in_provider: 'google.com', identities: { 'google.com': [key] } }, ...overrides });
  return key;
}
const post = (agent, url, data) => agent.post(url).set('Origin', 'http://localhost:5173').set('X-AllModelAI-Auth', '1').send(data);
async function login(agent, idToken, extra = {}) {
  const challenge = await post(agent, '/api/auth/firebase/challenge', { intent: extra.intent });
  if (challenge.status !== 200) return challenge;
  return post(agent, '/api/auth/firebase', { idToken, state: challenge.body.state, ...extra });
}
test('Google creates one SQL account, restores avatar/name and revokes the cookie on logout', async () => {
  const agent = request.agent(app);
  const result = await login(agent, token('google-new'));
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.user.name, 'Provider User');
  assert.equal(result.body.user.passwordHash, undefined);
  assert.equal((await agent.get('/api/auth/session')).body.user.avatar, 'https://example.com/avatar.png');
  const cookie = result.headers['set-cookie'].find(value => value.startsWith('allmodelai_session='));
  assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Lax/);
  assert.equal((await request(app).get('/api/auth/session').set('Cookie', cookie)).status, 200);
  await agent.post('/api/auth/logout');
  const expiredSession = await request(app).get('/api/auth/session').set('Cookie', cookie);
  assert.equal(expiredSession.status, 200);
  assert.equal(expiredSession.body.authenticated, false);
  assert.equal(expiredSession.body.user, null);
  const again = await login(agent, 'google-new');
  assert.equal(again.body.user.id, result.body.user.id);
  assert.equal(db.prepare('SELECT count(*) AS n FROM users WHERE email = ?').get('google-new@example.com').n, 1);
});
test('invalid, expired, revoked, stale, unsupported and unverified tokens cannot establish sessions', async () => {
  for (const value of ['invalid', 'expired', 'revoked', token('stale', { auth_time: 1 }), token('unverified', { email_verified: false }), token('no-email', { email: null }), token('password-token', { firebase: { sign_in_provider: 'password' } })]) {
    const agent = request.agent(app);
    const result = await login(agent, value);
    assert.ok([401, 403].includes(result.status), JSON.stringify(result.body));
    const guest = await agent.get('/api/auth/session');
    assert.equal(guest.status, 200);
    assert.equal(guest.body.user, null);
  }
});
test('verified provider email links to existing password account and preserves data', async () => {
  const owner = request.agent(app);
  const email = 'owner-social@example.com';
  const created = await owner.post('/api/auth/register').send({ name: 'Existing Owner', email, password: 'original-password' });
  assert.equal(created.status, 201);
  const id = created.body.user.id;
  const password = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(id).password_hash;
  await owner.post('/api/chat/history').send({ model: 'gemini', messages: [{ role: 'user', content: 'Keep this conversation' }] });
  db.prepare('INSERT INTO subscriptions (email, plan) VALUES (?, ?)').run(email, 'pro');
  const beforeHistory = (await owner.get('/api/chat/history')).body;
  const providerToken = token('existing-provider', { email });
  const linked = await login(request.agent(app), providerToken);
  assert.equal(linked.status, 200, JSON.stringify(linked.body));
  assert.equal(linked.body.user.id, id);
  assert.equal(db.prepare('SELECT password_hash FROM users WHERE id = ?').get(id).password_hash, password);
  assert.equal(db.prepare('SELECT plan FROM subscriptions WHERE email = ?').get(email).plan, 'pro');
  assert.equal(db.prepare('SELECT count(*) AS n FROM social_identities WHERE user_id = ? AND provider = ?').get(id, 'google.com').n, 1);
  const returning = await login(request.agent(app), providerToken);
  assert.equal(returning.body.user.id, id);
  await owner.post('/api/auth/logout');
  assert.equal((await login(request.agent(app), providerToken, { intent: 'link' })).status, 401);
  const relogin = await owner.post('/api/auth/login').send({ email, password: 'original-password' });
  assert.equal(relogin.status, 200);
  const explicitLink = await login(owner, providerToken, { intent: 'link' });
  assert.equal(explicitLink.status, 200, JSON.stringify(explicitLink.body));
  assert.deepEqual((await owner.get('/api/chat/history')).body, beforeHistory);
  assert.equal((await owner.get('/api/auth/session')).status, 200);
  const attacker = request.agent(app);
  await attacker.post('/api/auth/register').send({ name: 'Other', email: 'other-social@example.com', password: 'other-password' });
  assert.equal((await login(attacker, providerToken, { intent: 'link' })).body.code, 'IDENTITY_CONFLICT');
  // A changed email for the same provider subject never selects a different account.
  verified.get(providerToken).email = 'changed@example.com';
  assert.equal((await login(request.agent(app), providerToken)).body.user.id, id);
});
test('parallel provider sign-ins create only one user and one identity', async () => {
  const value = token('parallel');
  const results = await Promise.all(Array.from({ length: 4 }, () => login(request.agent(app), value)));
  assert.ok(results.every(result => result.status === 200));
  assert.equal(new Set(results.map(result => result.body.user.id)).size, 1);
  assert.equal(db.prepare('SELECT count(*) AS n FROM social_identities WHERE subject = ?').get(value).n, 1);
});
test('password registration racing social registration cannot overwrite the social account', async () => {
  const value = token('race-password');
  const results = await Promise.all([
    request(app).post('/api/auth/login').send({ name: 'Password', email: 'race-password@example.com', password: 'must-not-overwrite' }),
    login(request.agent(app), value),
  ]);
  assert.equal(db.prepare('SELECT count(*) AS n FROM users WHERE email = ?').get('race-password@example.com').n, 1);
  assert.ok(results.some((result) => result.status === 200));
  assert.ok(results.every((result) => [200, 401, 409].includes(result.status)));
});
test('CSRF origin, custom header, cookie binding and one-time challenge are enforced', async () => {
  assert.equal((await request(app).post('/api/auth/firebase/challenge').send({})).status, 403);
  assert.equal((await request(app).post('/api/auth/firebase/challenge').set('Origin', 'https://evil.example').set('X-AllModelAI-Auth', '1').send({})).status, 403);
  const agent = request.agent(app);
  const value = token('csrf');
  const challenge = await post(agent, '/api/auth/firebase/challenge', {});
  const payload = { idToken: value, state: challenge.body.state };
  assert.equal((await post(request(app), '/api/auth/firebase', payload)).status, 400);
  assert.equal((await post(agent, '/api/auth/firebase', payload)).status, 200);
  assert.ok([400, 403].includes((await post(agent, '/api/auth/firebase', payload)).status));
});
test('link challenge is invalid after logout, even with the provider token', async () => {
  const agent = request.agent(app);
  await login(agent, token('link-session'));
  const challenge = await post(agent, '/api/auth/firebase/challenge', { intent: 'link' });
  await agent.post('/api/auth/logout');
  const result = await post(agent, '/api/auth/firebase', { idToken: token('link-second'), state: challenge.body.state, intent: 'link' });
  assert.equal(result.status, 401);
});
test('GitHub access token exchange creates a session when Firebase omits email', async () => {
    githubSocialEmail.profileFromGitHubAccessToken = async () => ({
        provider: 'github.com',
        subject: 'github-noreply-user',
        email: 'github-noreply-user+noreply@users.noreply.github.com',
        name: 'Private GitHub',
        avatar: 'https://example.com/github.png',
    });
    const agent = request.agent(app);
    const challenge = await post(agent, '/api/auth/firebase/challenge', {});
    assert.equal(challenge.status, 200);
    const result = await post(agent, '/api/auth/firebase', {
        githubAccessToken: 'gho_test_only',
        state: challenge.body.state,
    });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.equal(result.body.user.email, 'github-noreply-user+noreply@users.noreply.github.com');
    assert.equal(
        db.prepare('SELECT count(*) AS n FROM social_identities WHERE provider = ? AND subject = ?').get('github.com', 'github-noreply-user').n,
        1,
    );
    githubSocialEmail.profileFromGitHubAccessToken = originalGitHubProfile;
});

test('Apple and GitHub use their own stable identities', async () => {
  for (const provider of ['apple.com', 'github.com']) {
    const value = token(provider, { firebase: { sign_in_provider: provider, identities: { [provider]: ['same-subject'] } } });
    assert.equal((await login(request.agent(app), value)).status, 200);
  }
  assert.equal(db.prepare('SELECT count(*) AS n FROM social_identities WHERE subject = ?').get('same-subject').n, 2);
});
test('production and mobile sessions use secure cookies and demo auth remains disabled', async () => {
  const previous = process.env.NODE_ENV;
  const secure = process.env.COOKIE_SECURE;
  process.env.NODE_ENV = 'production'; process.env.COOKIE_SECURE = 'true'; process.env.ENABLE_DEMO_SOCIAL_AUTH = 'true';
  try {
    const challenge = await post(request(app), '/api/auth/firebase/challenge', {});
    assert.match(challenge.headers['set-cookie'][0], /Secure/);
    const result = await post(request(app), '/api/auth/firebase', { idToken: token('mobile-production'), state: challenge.body.state, rememberMe: false })
      .set('Cookie', challenge.headers['set-cookie'][0].split(';')[0]).set('User-Agent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)');
    assert.equal(result.status, 200);
    const cookie = result.headers['set-cookie'].find(value => value.startsWith('allmodelai_session='));
    assert.match(cookie, /Secure/); assert.doesNotMatch(cookie, /Max-Age/);
    assert.equal((await request(app).get('/api/auth/session').set('Cookie', cookie)).status, 200);
    assert.equal((await request(app).post('/api/auth/social').send({ provider: 'google', accountId: 'google-1' })).status, 404);
    assert.equal((await request(app).get('/api/auth/google/callback?code=fake')).status, 410);
  } finally { process.env.NODE_ENV = previous; if (secure === undefined) delete process.env.COOKIE_SECURE; else process.env.COOKIE_SECURE = secure; delete process.env.ENABLE_DEMO_SOCIAL_AUTH; }
});

test('verifySocialToken rejects malformed tokens or missing Admin credentials', async () => {
  const prev = {
    FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
    FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL,
    FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY,
  };
  const { resetFirebaseAdminForTests, isFirebaseAdminConfigured } = require('../src/firebaseAdmin');
  resetFirebaseAdminForTests();
  try {
    if (isFirebaseAdminConfigured()) {
      await assert.rejects(original('not-a-jwt'), (error) => error.code?.startsWith('auth/'));
      return;
    }
    process.env.FIREBASE_PROJECT_ID = 'allmodelai-test-only';
    delete process.env.FIREBASE_CLIENT_EMAIL;
    delete process.env.FIREBASE_PRIVATE_KEY;
    resetFirebaseAdminForTests();
    await assert.rejects(original('not-a-jwt'), (error) => error.status === 503);
  } finally {
    Object.entries(prev).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
    resetFirebaseAdminForTests();
  }
});
