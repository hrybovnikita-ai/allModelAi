import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('firebase.js wires branded localhost flag into auth domain resolution', async () => {
  const source = await readFile(new URL('../src/lib/firebase.js', import.meta.url), 'utf8');
  assert.match(source, /isBrandedAuthOnLocalhostEnabled/);
  assert.match(source, /VITE_FIREBASE_BRANDED_AUTH_ON_LOCALHOST/);
  assert.match(source, /brandedAuthOnLocalhost/);
  assert.doesNotMatch(source, /localhost uses firebaseapp.com authDomain; branded env is ignored/);
});

test('vite dev server proxies legacy /__/auth to Firebase when using firebaseapp authDomain', async () => {
  const vite = await readFile(new URL('../vite.config.js', import.meta.url), 'utf8');
  assert.match(vite, /'\/__\/auth'/);
  assert.match(vite, /allmodelai\.firebaseapp\.com/);
  assert.match(vite, /same-origin-allow-popups/);
});
