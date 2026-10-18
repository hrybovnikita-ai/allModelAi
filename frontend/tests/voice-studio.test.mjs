import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { detectTextLanguage } from '../src/lib/tts/voicePreferences.js';
import { cleanTextForSpeech, getCuratedVoices, matchBrowserVoice } from '../src/lib/tts/ttsClient.js';

test('curated voices include four male and four female profiles', () => {
  const voices = getCuratedVoices();
  assert.equal(voices.filter((v) => v.gender === 'male').length, 4);
  assert.equal(voices.filter((v) => v.gender === 'female').length, 4);
});

test('frontend language detection matches EN/RU/UK heuristics', () => {
  assert.equal(detectTextLanguage('Shipping update for your order'), 'en');
  assert.equal(detectTextLanguage('Сегодня хороший день для работы'), 'ru');
  assert.equal(detectTextLanguage('Сьогодні гарний день для навчання'), 'uk');
});

test('browser voice matcher prefers language and gender hints', () => {
  const profile = getCuratedVoices().find((v) => v.id === 'female-soft');
  const voices = [
    { name: 'Microsoft David', lang: 'en-US' },
    { name: 'Microsoft Zira', lang: 'en-US' },
    { name: 'Microsoft Irina', lang: 'ru-RU' },
  ];
  const matched = matchBrowserVoice(profile, 'en', voices);
  assert.equal(matched.name, 'Microsoft Zira');
});

test('speech cleaner strips markdown noise', () => {
  assert.match(cleanTextForSpeech('**Bold** and `code`'), /Bold/);
  assert.doesNotMatch(cleanTextForSpeech('visit https://x.test/a'), /https/);
});

test('voice studio route and component exist', async () => {
  const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const studio = await readFile(new URL('../src/components/VoiceStudio/VoiceStudio.jsx', import.meta.url), 'utf8');
  const nav = await readFile(new URL('../src/components/Navigation/navConfig.js', import.meta.url), 'utf8');
  assert.match(app, /path="\/voice-studio"/);
  assert.match(studio, /Voice Studio/);
  assert.match(studio, /Male/);
  assert.match(studio, /Female/);
  assert.match(nav, /\/voice-studio/);
});

test('message actions use shared playback controller', async () => {
  const actions = await readFile(new URL('../src/components/Chat/MessageActions.jsx', import.meta.url), 'utf8');
  assert.match(actions, /playbackController/);
  assert.match(actions, /playText/);
  assert.match(actions, /pausePlayback/);
  assert.doesNotMatch(actions, /speechSynthesis\?\.speak/);
});
