import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('firebase.js does not statically import loadFirebaseConfig (breaks TDZ cycle)', async () => {
  const source = await readFile(new URL('../src/lib/firebase.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /import\s*\{[^}]*ensureFirebaseSocialConfigLoaded[^}]*\}\s*from\s*['"]\.\/loadFirebaseConfig\.js['"]/);
  assert.match(source, /import\s*\(\s*['"]\.\/loadFirebaseConfig\.js['"]\s*\)/);
});

test('authBootstrap does not import socialSignIn (breaks TDZ cycle)', async () => {
  const source = await readFile(new URL('../src/lib/authBootstrap.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /from\s*['"]\.\/socialSignIn\.js['"]/);
  assert.match(source, /from\s*['"]\.\/socialRedirectState\.js['"]/);
});

test('socialSignIn invalidates bootstrap via authBootstrapState only', async () => {
  const source = await readFile(new URL('../src/lib/socialSignIn.js', import.meta.url), 'utf8');
  assert.match(source, /from\s*['"]\.\/authBootstrapState\.js['"]/);
  assert.doesNotMatch(source, /from\s*['"]\.\/authBootstrap\.js['"]/);
});

test('firebase.js uses socialAuthInstance instead of bare auth binding', async () => {
  const source = await readFile(new URL('../src/lib/firebase.js', import.meta.url), 'utf8');
  assert.match(source, /let socialAuthInstance/);
  assert.doesNotMatch(source, /\nlet auth;/);
});

test('auth module graph loads without initialization errors', async () => {
  const modules = [
    '../src/lib/firebase.js',
    '../src/lib/socialSignIn.js',
    '../src/lib/authBootstrap.js',
    '../src/lib/loadFirebaseConfig.js',
  ];
  for (const spec of modules) {
    await import(new URL(spec, import.meta.url).href);
  }
});
