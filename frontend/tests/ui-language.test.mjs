import assert from 'node:assert/strict';
import test from 'node:test';
import { LANGUAGES } from '../src/lib/languages.js';
import {
  getLanguageRevision,
  sanitizeStoredLanguagePreferences,
  setLanguage,
  shouldApplyRemoteLanguage,
} from '../src/lib/languagePreference.js';
import { translate } from '../src/lib/languages.js';

test('switching English, Russian, and Ukrainian does not throw', () => {
  for (const name of ['Russian', 'Ukrainian', 'English', 'Japanese', 'Chinese']) {
    const applied = setLanguage(name);
    assert.equal(applied.language, name);
    assert.equal(typeof translate('heading', applied.language === 'Russian' ? 'ru' : 'en'), 'string');
  }
});

test('missing translation keys fall back to readable text', () => {
  const text = translate('not-a-real-key', 'zz', {});
  assert.equal(typeof text, 'string');
  assert.doesNotMatch(text, /undefined/);
  assert.equal(translate({ bad: true }, 'ru'), ' ');
  assert.equal(translate('heading', 'ru', null), translate('heading', 'ru'));
});

test('corrupt language storage is sanitized on recovery', () => {
  const storage = globalThis.localStorage;
  if (!storage) return;
  storage.setItem('allmodelai_language', '{"bad":true}');
  const language = sanitizeStoredLanguagePreferences();
  assert.equal(language, 'English');
  assert.notEqual(storage.getItem('allmodelai_language'), '{"bad":true}');
});

test('a newer language selection blocks a stale account restore', () => {
  const first = setLanguage('Russian');
  const second = setLanguage('Ukrainian');
  assert.equal(shouldApplyRemoteLanguage(first.revision), false);
  assert.equal(shouldApplyRemoteLanguage(second.revision), true);
  assert.equal(getLanguageRevision(), second.revision);
});

test('every listed interface language has a code and native name', () => {
  const codes = new Set();
  for (const language of LANGUAGES) {
    assert.ok(language.code);
    assert.ok(language.native);
    assert.equal(codes.has(language.code), false);
    codes.add(language.code);
    assert.equal(typeof translate('settings', language.code), 'string');
  }
  for (const code of ['en', 'ru', 'uk', 'pl', 'de', 'fi', 'fr', 'es', 'it', 'cs', 'sl', 'hr', 'ro', 'ja', 'zh', 'zh-TW', 'hi', 'pt', 'nl', 'tr']) {
    assert.equal(codes.has(code), true);
  }
});
