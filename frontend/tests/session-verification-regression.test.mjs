import assert from 'node:assert/strict';
import { beforeEach, afterEach, test } from 'node:test';
import {
  clearAllSessionData, rememberSession, restoreSession, performLogout,
  confirmSession, isSessionUserVerified, readStoredSessionUser, markFreshLogin,
} from '../src/lib/session.js';
import { consumeSessionRestoreMeta } from '../src/lib/sessionRestoreMeta.js';
import { exchangeSocialSession } from '../src/lib/socialSession.js';
import { bootstrapGoogleRedirectRecovery, resetGoogleRedirectBootstrapForTests } from '../src/lib/googleRedirectRecovery.js';
import { persistRedirectIntent, markRedirectFlowCommitted, clearSocialRedirectIntent } from '../src/lib/socialRedirectState.js';

const user = { id: 1, email: 'regression@example.com', name: 'Regression' };
const originalFetch = globalThis.fetch;
beforeEach(() => {
  const values = new Map();
  globalThis.localStorage = globalThis.sessionStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  };
  clearAllSessionData();
  resetGoogleRedirectBootstrapForTests();
});
afterEach(() => {
  clearSocialRedirectIntent();
  clearAllSessionData();
  globalThis.fetch = originalFetch;
  delete globalThis.localStorage;
  delete globalThis.sessionStorage;
});

test('consuming metadata twice cannot promote a cached Firebase profile', () => {
  rememberSession(user, { serverVerified: false });
  consumeSessionRestoreMeta();
  consumeSessionRestoreMeta();
  assert.equal(isSessionUserVerified(user), false);
  assert.equal(isSessionUserVerified(readStoredSessionUser()), false);
});

test('definitive expiry clears a recently authenticated profile and verification', async () => {
  rememberSession(user);
  markFreshLogin();
  globalThis.fetch = async () => Response.json({ authenticated: false, user: null }, { status: 401 });
  assert.equal(await restoreSession({ force: true }), null);
  assert.equal(isSessionUserVerified(user), false);
  assert.equal(readStoredSessionUser(), null);
});

test('logout clears UI before a slow server responds and blocks stale restore results', async () => {
  rememberSession(user);
  let finish;
  globalThis.fetch = () => new Promise(resolve => { finish = resolve; });
  const restore = restoreSession({ force: true });
  const rejected = assert.rejects(restore, /Session changed/);
  const finishRestore = finish;
  globalThis.fetch = async (_url, options) => {
    assert.equal(options.credentials, 'include');
    assert.ok(options.signal);
    return new Response(null, { status: 204 });
  };
  const logout = performLogout();
  assert.equal(readStoredSessionUser(), null);
  assert.equal(isSessionUserVerified(user), false);
  finishRestore(Response.json({ user }));
  await rejected;
  assert.equal((await logout).serverOk, true);
});

test('failed server logout is reported and cannot silently restore on refresh; explicit login works', async () => {
  rememberSession(user);
  globalThis.fetch = async () => new Response(null, { status: 404 });
  const result = await performLogout();
  assert.equal(result.serverOk, false);
  assert.ok(result.warning);
  globalThis.fetch = async () => Response.json({ user, authenticated: true });
  assert.equal(await restoreSession({ force: true }), null);
  const loggedIn = await confirmSession(user);
  assert.equal(isSessionUserVerified(loggedIn), true);
});

test('Google redirect recovery cannot succeed when its exchange has no usable backend session', async () => {
  persistRedirectIntent('google', {}, 'awaiting-google-return');
  markRedirectFlowCommitted();
  globalThis.fetch = async url => String(url).endsWith('/session')
    ? Response.json({ authenticated: false, user: null }, { status: 401 })
    : Response.json({ state: 'test-challenge', user });
  let calls = 0;
  const pipeline = () => { calls++; return exchangeSocialSession('test-token'); };
  const outcomes = await Promise.all([
    bootstrapGoogleRedirectRecovery(pipeline), bootstrapGoogleRedirectRecovery(pipeline),
  ]);
  assert.equal(calls, 1);
  assert.deepEqual(outcomes, [null, null]);
  assert.equal(isSessionUserVerified(user), false);
});
