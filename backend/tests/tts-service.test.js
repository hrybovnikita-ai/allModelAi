const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  cleanTextForSpeech,
  detectLanguageCode,
  clampSpeed,
  getTtsStatus,
  resolveKokoroVoiceId,
  synthesizeSpeech,
} = require('../src/services/tts/ttsService');
const {
  listVoiceProfiles,
  getVoiceProfile,
  pickPreferredEngine,
  setKokoroAvailability,
  KOKORO_VOICE_PROFILES,
} = require('../src/services/tts/voiceCatalog');
const { sanitizePreferences } = require('../src/controllers/ttsController');

test('voice catalog exposes Kokoro male/female plus curated cloud profiles', () => {
  setKokoroAvailability(null);
  const voices = listVoiceProfiles({ includeUnavailableKokoro: true });
  assert.ok(voices.some((v) => v.gender === 'male' && v.id === 'am_michael'));
  assert.ok(voices.some((v) => v.gender === 'female' && v.id === 'af_heart'));
  assert.ok(voices.some((v) => v.id === 'female-soft'));
  assert.ok(getVoiceProfile('af_bella')?.kokoroVoice === 'af_bella');
  assert.equal(KOKORO_VOICE_PROFILES.length, 5);
});

test('language detection covers English, Russian and Ukrainian', () => {
  assert.equal(detectLanguageCode('Hello world from AllModelAI'), 'en');
  assert.equal(detectLanguageCode('Привет, это тест голоса'), 'ru');
  assert.equal(detectLanguageCode('Привіт, це український голос із ґ'), 'uk');
});

test('speech cleaner removes code fences and urls', () => {
  const cleaned = cleanTextForSpeech('See ```js\nconsole.log(1)\n``` and https://example.com now.');
  assert.match(cleaned, /Code block omitted/);
  assert.match(cleaned, /link/);
  assert.doesNotMatch(cleaned, /console\.log/);
});

test('speed is clamped to a natural speaking range', () => {
  assert.equal(clampSpeed(0.2), 0.7);
  assert.equal(clampSpeed(3), 1.5);
  assert.equal(clampSpeed(1.1), 1.1);
});

test('preferences sanitizer rejects unknown voices and engines', () => {
  const prefs = sanitizePreferences({
    voiceId: 'not-a-voice',
    language: 'de',
    engine: 'pirated',
    speed: 9,
    autoPlay: 1,
  });
  assert.equal(prefs.voiceId, 'af_heart');
  assert.equal(prefs.language, 'auto');
  assert.equal(prefs.engine, 'auto');
  assert.equal(prefs.speed, 1.5);
  assert.equal(prefs.autoPlay, true);
});

test('preferences sanitizer accepts kokoro engine and voices', () => {
  const prefs = sanitizePreferences({
    voiceId: 'am_adam',
    engine: 'kokoro',
    speed: 1.05,
  });
  assert.equal(prefs.voiceId, 'am_adam');
  assert.equal(prefs.engine, 'kokoro');
  assert.equal(prefs.style, 'calm-professional');
});

test('auto engine prefers Kokoro over paid providers', () => {
  const previousOpenAi = process.env.OPENAI_API_KEY;
  const previousEleven = process.env.ELEVENLABS_API_KEY;
  process.env.OPENAI_API_KEY = 'sk-test';
  process.env.ELEVENLABS_API_KEY = 'el-test';
  assert.equal(pickPreferredEngine(null, { kokoroAvailable: true }), 'kokoro');
  assert.equal(pickPreferredEngine(null, { kokoroAvailable: false }), 'browser');
  assert.equal(pickPreferredEngine('openai', { kokoroAvailable: true }), 'openai');
  assert.equal(pickPreferredEngine('browser', { kokoroAvailable: true }), 'browser');
  if (previousOpenAi !== undefined) process.env.OPENAI_API_KEY = previousOpenAi;
  else delete process.env.OPENAI_API_KEY;
  if (previousEleven !== undefined) process.env.ELEVENLABS_API_KEY = previousEleven;
  else delete process.env.ELEVENLABS_API_KEY;
});

test('preferred engine falls back to browser without Kokoro or cloud keys', async () => {
  const previousOpenAi = process.env.OPENAI_API_KEY;
  const previousEleven = process.env.ELEVENLABS_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPEN_AI_API_KEY;
  delete process.env.ELEVENLABS_API_KEY;
  setKokoroAvailability(false);
  assert.equal(pickPreferredEngine(null, { kokoroAvailable: false }), 'browser');
  // Status probe must not hang the test suite by spawning Python.
  const status = await getTtsStatus();
  assert.equal(status.providers.browser, true);
  assert.ok(typeof status.preferredEngine === 'string');
  assert.ok(status.notes?.browser);
  if (previousOpenAi !== undefined) process.env.OPENAI_API_KEY = previousOpenAi;
  if (previousEleven !== undefined) process.env.ELEVENLABS_API_KEY = previousEleven;
});

test('resolveKokoroVoiceId maps curated ids', () => {
  assert.equal(resolveKokoroVoiceId('am_michael'), 'am_michael');
  assert.equal(resolveKokoroVoiceId('af_nicole'), 'af_nicole');
  assert.equal(resolveKokoroVoiceId('female-soft'), null);
});

test('invalid voice id is rejected before synthesis', async () => {
  await assert.rejects(
    () => synthesizeSpeech({ text: 'Hello', voiceId: 'totally-fake-voice', engine: 'browser' }),
    (error) => error.code === 'TTS_INVALID_VOICE' && error.status === 400,
  );
});

test('browser-only request surfaces free fallback without calling paid APIs', async () => {
  setKokoroAvailability(false);
  await assert.rejects(
    () => synthesizeSpeech({ text: 'Hello from AllModelAI', voiceId: 'af_heart', engine: 'browser' }),
    (error) => error.code === 'TTS_USE_BROWSER_FALLBACK' && error.fallback === 'browser',
  );
});

test('empty text is rejected', async () => {
  await assert.rejects(
    () => synthesizeSpeech({ text: '   ', voiceId: 'am_michael' }),
    (error) => error.code === 'TTS_EMPTY_TEXT',
  );
});

test('long text generation is rejected over max length', async () => {
  const huge = 'word '.repeat(5000);
  await assert.rejects(
    () => synthesizeSpeech({ text: huge, voiceId: 'am_michael', engine: 'browser' }),
    (error) => error.code === 'TTS_TEXT_TOO_LONG',
  );
});
