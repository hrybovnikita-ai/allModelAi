import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { isClerkPublishableKeyConfigured } from '../src/lib/clerkTestConfig.js';

test('clerk publishable key check accepts test and live prefixes without returning the key', () => {
  assert.equal(isClerkPublishableKeyConfigured({ VITE_CLERK_PUBLISHABLE_KEY: 'pk_test_example' }), true);
  assert.equal(isClerkPublishableKeyConfigured({ VITE_CLERK_PUBLISHABLE_KEY: 'pk_live_example' }), true);
  assert.equal(isClerkPublishableKeyConfigured({ VITE_CLERK_PUBLISHABLE_KEY: '' }), false);
  assert.equal(isClerkPublishableKeyConfigured({ VITE_CLERK_PUBLISHABLE_KEY: 'not-a-key' }), false);
});

test('clerk test route is development-only and registered before /auth/:provider', async () => {
  const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const clerk = app.indexOf('path="/auth/clerk-test"');
  const wildcard = app.indexOf('path="/auth/:provider"');
  assert.ok(clerk > 0 && wildcard > clerk);
  assert.match(app, /import\.meta\.env\.DEV/);
  assert.match(app, /ClerkAuthTestPage/);
  assert.doesNotMatch(app, /<ClerkProvider/);
});

test('clerk test page does not call AllModelAI auth APIs', async () => {
  const page = await readFile(new URL('../src/components/ClerkAuthTest/ClerkAuthTestPage.jsx', import.meta.url), 'utf8');
  assert.match(page, /ClerkProvider/);
  assert.match(page, /<SignIn/);
  assert.match(page, /<SignUp/);
  assert.match(page, /<UserButton/);
  assert.match(page, /signed-in/);
  assert.match(page, /signed-out/);
  assert.match(page, /exchangeClerkSessionForAllModelAI/);
  assert.match(page, /Test Dashboard/);
  assert.doesNotMatch(page, /signInWithPopup|signInWithEmailAndPassword/);
});

test('firebase login remains available alongside optional clerk section', async () => {
  const login = await readFile(new URL('../src/components/Login/Login.jsx', import.meta.url), 'utf8');
  assert.match(login, /Continue with Google/);
  assert.match(login, /signInWithEmailPasswordAllModelAI/);
  assert.match(login, /LoginClerkSection/);
});
