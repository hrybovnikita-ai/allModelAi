import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  isClerkMainAuthClientReady,
  isClerkMainAuthEnvEnabled,
} from '../src/lib/clerkAuthConfig.js';

test('clerk main auth requires explicit client and publishable key', () => {
  assert.equal(isClerkMainAuthEnvEnabled({ VITE_CLERK_AUTH_ENABLED: 'true' }), true);
  assert.equal(isClerkMainAuthEnvEnabled({ VITE_CLERK_AUTH_ENABLED: 'false' }), false);
  assert.equal(
    isClerkMainAuthClientReady({
      VITE_CLERK_AUTH_ENABLED: 'true',
      VITE_CLERK_PUBLISHABLE_KEY: 'pk_test_example',
    }),
    true,
  );
  assert.equal(
    isClerkMainAuthClientReady({
      VITE_CLERK_AUTH_ENABLED: 'true',
      VITE_CLERK_PUBLISHABLE_KEY: '',
    }),
    false,
  );
});

test('login page embeds clerk section behind feature flags', async () => {
  const login = await readFile(new URL('../src/components/Login/Login.jsx', import.meta.url), 'utf8');
  assert.match(login, /LoginClerkSection/);
  assert.match(login, /fetchClerkAuthBackendEnabled/);
  assert.match(login, /login-auth-methods/);
  assert.match(login, /authMethod/);
  assert.match(login, /Continue with Google/);
  assert.match(login, /signInWithEmailPasswordAllModelAI/);
  assert.doesNotMatch(login, /@clerk\/react/);
});

test('clerk login section uses compact appearance without stacking under google', async () => {
  const section = await readFile(new URL('../src/components/Login/LoginClerkSection.jsx', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/components/Login/LoginClerkSection.css', import.meta.url), 'utf8');
  const appearance = await readFile(new URL('../src/lib/clerkAuthConfig.js', import.meta.url), 'utf8');
  assert.match(section, /clerkAuthAppearance/);
  assert.match(section, /clerkAuthLocalization/);
  assert.match(section, /isPermanentClerkExchangeFailure/);
  assert.match(section, /permanentFailure/);
  assert.match(css, /max-width:\s*100%/);
  assert.match(css, /login-clerk-password-hint/);
  assert.match(appearance, /header:\s*\{\s*display:\s*'none'/);
  assert.match(appearance, /footer:\s*\{\s*display:\s*'none'/);
});

test('settings connected accounts can link Clerk after an existing AllModelAI session', async () => {
  const connections = await readFile(new URL('../src/components/Settings/SocialConnections.jsx', import.meta.url), 'utf8');
  const clerkConnect = await readFile(new URL('../src/components/Settings/ClerkConnect.jsx', import.meta.url), 'utf8');
  assert.match(connections, /ClerkConnect/);
  assert.match(clerkConnect, /exchangeClerkSessionForAllModelAI/);
  assert.match(clerkConnect, /Connect Clerk/);
});

test('clerk session exchange uses the backend exchange route', async () => {
  const exchange = await readFile(new URL('../src/lib/clerkSessionExchange.js', import.meta.url), 'utf8');
  assert.match(exchange, /\/api\/auth\/clerk\/exchange/);
  assert.match(exchange, /CLERK_LINK_REQUIRED/);
  assert.match(exchange, /confirmSession/);
});

test('logout clears clerk client session marker', async () => {
  const session = await readFile(new URL('../src/lib/session.js', import.meta.url), 'utf8');
  assert.match(session, /signOutClerkClient/);
});
