import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { AUTH_STATUS, isAuthInitializing } from '../src/lib/authSessionStatus.js';

const root = fileURLToPath(new URL('../', import.meta.url));

test('auth status machine marks initializing states', () => {
  assert.equal(isAuthInitializing(AUTH_STATUS.INITIALIZING), true);
  assert.equal(isAuthInitializing(AUTH_STATUS.CHECKING_SESSION), true);
  assert.equal(isAuthInitializing(AUTH_STATUS.CHECKING_REDIRECT), true);
  assert.equal(isAuthInitializing(AUTH_STATUS.AUTHENTICATED), false);
  assert.equal(isAuthInitializing(AUTH_STATUS.UNAUTHENTICATED), false);
  assert.equal(AUTH_STATUS.ERROR, 'authentication-error');
});

test('RequireAuth sends unauthenticated users to /login', () => {
  const src = readFileSync(`${root}src/components/Login/RequireAuth.jsx`, 'utf8');
  assert.match(src, /to="\/login"/);
  assert.doesNotMatch(src, /to="\/"\s*\n\s*replace[\s\S]*signedOut/);
});

test('SessionProvider does not hydrate authenticated user from storage alone', () => {
  const src = readFileSync(`${root}src/components/Session/SessionProvider.jsx`, 'utf8');
  assert.doesNotMatch(src, /readStoredSessionUser\(\)/);
  assert.match(src, /user: null/);
});

test('auth bootstrap clears stale redirect intent after failed recovery', () => {
  const src = readFileSync(`${root}src/lib/authBootstrap.js`, 'utf8');
  assert.match(src, /clearSocialRedirectIntent/);
});

test('auth bootstrap deduplicates concurrent initialization', () => {
  const src = readFileSync(`${root}src/lib/authBootstrap.js`, 'utf8');
  assert.match(src, /bootstrapInflight/);
  assert.match(src, /bootstrapAuthenticatedUser/);
  assert.match(src, /bootstrapInflight = null/);
});

test('navbar uses skeleton instead of checking session copy', () => {
  const src = readFileSync(`${root}src/components/Navbar/NavAuthSection.jsx`, 'utf8');
  assert.match(src, /nav-auth-skeleton/);
  assert.doesNotMatch(src, /Checking your session/);
});
