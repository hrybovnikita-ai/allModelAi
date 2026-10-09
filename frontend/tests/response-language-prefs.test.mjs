import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_RESPONSE_PREFS, readResponsePrefs, writeResponsePrefs } from '../src/lib/responseLanguagePrefs.js';

test('response prefs default to auto-detect and merge stored values', () => {
  const storage = {
    store: new Map(),
    getItem(key) { return this.store.get(key) ?? null; },
    setItem(key, value) { this.store.set(key, String(value)); },
  };
  writeResponsePrefs({ length: 'short' }, storage);
  const prefs = readResponsePrefs(storage);
  assert.equal(prefs.length, 'short');
  assert.equal(prefs.responseLanguage, 'auto');
  assert.equal(prefs.tone, DEFAULT_RESPONSE_PREFS.tone);
});
