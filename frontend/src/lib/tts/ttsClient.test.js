/**
 * Lightweight Node checks for Voice Studio client helpers.
 * Run: node --test src/lib/tts/ttsClient.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanTextForSpeech,
  getCuratedVoices,
  matchBrowserVoice,
  mergeTtsCatalogWithHealth,
} from './ttsClient.js';

test('curated voices include Kokoro male and female ids', () => {
  const voices = getCuratedVoices();
  assert.ok(voices.some((v) => v.id === 'am_michael' && v.gender === 'male'));
  assert.ok(voices.some((v) => v.id === 'af_heart' && v.gender === 'female'));
  assert.ok(voices.some((v) => v.engine === 'kokoro'));
});

test('cleanTextForSpeech strips code and urls', () => {
  const cleaned = cleanTextForSpeech('Hi ```js\nx\n``` https://x.test done');
  assert.match(cleaned, /Code block omitted/);
  assert.match(cleaned, /link/);
});

test('matchBrowserVoice prefers gender hints', () => {
  const profile = getCuratedVoices().find((v) => v.id === 'am_michael');
  const deviceVoices = [
    { name: 'Microsoft Zira', lang: 'en-US' },
    { name: 'Microsoft David', lang: 'en-US' },
  ];
  const matched = matchBrowserVoice(profile, 'en', deviceVoices);
  assert.match(String(matched?.name || ''), /David/i);
});

test('mergeTtsCatalogWithHealth marks Kokoro online from public health when catalog was offline', () => {
  const merged = mergeTtsCatalogWithHealth(
    {
      providers: { kokoro: false, browser: true },
      preferredEngine: 'browser',
      voices: getCuratedVoices(),
    },
    {
      providers: { kokoro: true, browser: true },
      preferredEngine: 'kokoro',
      kokoro: { available: true, ready: true, model: 'Kokoro-82M' },
    },
  );
  assert.equal(merged.providers.kokoro, true);
  assert.equal(merged.preferredEngine, 'kokoro');
  assert.equal(merged.kokoro.available, true);
});
