import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));

test('auth bootstrap defers getRedirectResult to gate before restoreSession', () => {
  const src = readFileSync(`${root}src/lib/authBootstrap.js`, 'utf8');
  assert.match(src, /REDIRECT_RECOVERY_DEFERRED/);
  assert.match(src, /ensureRedirectPrerequisitesReady/);
  assert.doesNotMatch(src, /awaitGoogleRedirectRecovery/);
  assert.ok(src.indexOf('ensureRedirectPrerequisitesReady') < src.indexOf('restoreSession'));
});

test('SessionProvider uses auth bootstrap instead of immediate restoreSession only', () => {
  const src = readFileSync(`${root}src/components/Session/SessionProvider.jsx`, 'utf8');
  assert.match(src, /bootstrapAuthenticatedUser/);
  assert.match(src, /CHECKING_REDIRECT|checking-redirect/);
});

test('SESSION_UPDATED_EVENT updates authenticated user email for listeners', async () => {
  const storage = new Map();
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => { storage.set(key, value); },
    removeItem: (key) => { storage.delete(key); },
  };
  globalThis.sessionStorage = globalThis.localStorage;
  const listeners = new Map();
  globalThis.addEventListener = (name, handler) => {
    listeners.set(name, handler);
  };
  globalThis.removeEventListener = (name) => {
    listeners.delete(name);
  };
  globalThis.dispatchEvent = (event) => {
    listeners.get(event.type)?.(event);
    return true;
  };

  const { rememberSession, SESSION_UPDATED_EVENT } = await import('../src/lib/session.js');
  let seen = null;
  const handler = (event) => {
    seen = event.detail?.user?.email || null;
  };
  globalThis.addEventListener(SESSION_UPDATED_EVENT, handler);
  rememberSession({ email: 'listener@example.com', name: 'Listener' });
  globalThis.removeEventListener(SESSION_UPDATED_EVENT, handler);
  assert.equal(seen, 'listener@example.com');

  delete globalThis.localStorage;
  delete globalThis.sessionStorage;
  delete globalThis.addEventListener;
  delete globalThis.removeEventListener;
  delete globalThis.dispatchEvent;
});
