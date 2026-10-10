import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_RESPONSE_PREFS,
  profileLanguageToResponsePref,
  readResponsePrefs,
  writeResponsePrefs,
} from '../src/lib/responseLanguagePrefs.js';

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

test('profile language maps explicit AI response preference only', () => {
  assert.equal(profileLanguageToResponsePref({ responseLanguage: 'ukrainian' }), 'ukrainian');
  const storage = {
    store: new Map(),
    getItem(key) { return this.store.get(key) ?? null; },
    setItem(key, value) { this.store.set(key, String(value)); },
  };
  storage.setItem('allmodelai_profile', JSON.stringify({ language: 'Ukrainian' }));
  storage.setItem('allmodelai_response_prefs', JSON.stringify({ responseLanguage: 'auto' }));
  const prefs = readResponsePrefs(storage);
  assert.equal(prefs.profileLanguage, 'auto');
});
