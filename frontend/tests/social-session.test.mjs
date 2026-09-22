import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { exchangeSocialSession, socialError } from '../src/lib/socialSession.js';
import { clearAllSessionData } from '../src/lib/session.js';

test('social login confirms the actual session cookie even without browser storage', async t => {
  const old = globalThis.fetch;
  t.after(() => { globalThis.fetch = old; clearAllSessionData(); });
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/challenge')) return Response.json({ state: 'challenge' });
    return Response.json({ user: { id: 1, email: 'social@example.com', name: 'Social' } });
  };
  assert.equal((await exchangeSocialSession('verified-token')).email, 'social@example.com');
  assert.deepEqual(calls.map(call => call.url), ['/api/auth/firebase/challenge', '/api/auth/firebase', '/api/auth/session']);
  assert.equal(calls[1].options.credentials, 'include');
  assert.equal(calls[1].options.headers['X-AllModelAI-Auth'], '1');
  assert.equal(calls[2].options.cache, 'no-store');
});
test('missing cookie and backend errors prevent successful login', async t => {
  const old = globalThis.fetch;
  t.after(() => { globalThis.fetch = old; clearAllSessionData(); });
  globalThis.fetch = async url => url.endsWith('/session') ? Response.json({}, { status: 401 }) : Response.json({ state: 'state', user: { email: 'user@example.com' } });
  await assert.rejects(exchangeSocialSession('token'), /could not be verified/);
  globalThis.fetch = async () => Response.json({ code: 'ACCOUNT_LINK_REQUIRED', message: 'Sign in first' }, { status: 409 });
  await assert.rejects(exchangeSocialSession('token'), error => error.code === 'ACCOUNT_LINK_REQUIRED');
});
test('link intent is explicit and social dashboard navigation follows confirmed authentication', async t => {
  const old = globalThis.fetch;
  t.after(() => { globalThis.fetch = old; clearAllSessionData(); });
  const bodies = [];
  globalThis.fetch = async (_url, options) => {
    if (options.body) bodies.push(JSON.parse(options.body));
    return Response.json({ state: 'state', user: { email: 'owner@example.com' } });
  };
  await exchangeSocialSession('token', { link: true });
  assert.ok(bodies.every(body => body.intent === 'link'));
  const login = await readFile(new URL('../src/components/Login/Login.jsx', import.meta.url), 'utf8');
  assert.match(login, /await socialSignIn[\s\S]*?navigate\('\/dashboard'/);
  assert.match(socialError({ code: 'auth/popup-blocked' }), /Allow popups/);
  assert.match(socialError({ code: 'auth/popup-closed-by-user' }), /canceled/);
});
