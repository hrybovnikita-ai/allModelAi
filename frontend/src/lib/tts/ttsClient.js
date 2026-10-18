import { resolveApiUrl } from '../apiBase.js';
import { nativeClientHeaders } from '../apiBase.js';
import { nativeSessionHeaders } from '../nativeSession.js';
import { firebaseSessionFallbackHeaders } from '../firebaseSessionFallback.js';
import { detectTextLanguage, languageToLocale, readLocalVoicePreferences } from './voicePreferences.js';

const CURATED_VOICES = [
  { id: 'am_michael', gender: 'male', style: 'warm-friendly', label: 'Michael (Kokoro)', description: 'Warm American male — clear and conversational.', languages: ['en'], supports: { speed: true, pitch: false, style: true }, provider: 'kokoro', engine: 'kokoro', browserHints: ['david', 'mark', 'james'] },
  { id: 'am_adam', gender: 'male', style: 'calm-professional', label: 'Adam (Kokoro)', description: 'Steady American male — calm and professional.', languages: ['en'], supports: { speed: true, pitch: false, style: true }, provider: 'kokoro', engine: 'kokoro', browserHints: ['ryan', 'arthur'] },
  { id: 'af_heart', gender: 'female', style: 'soft-natural', label: 'Heart (Kokoro)', description: 'Soft American female — natural and friendly.', languages: ['en'], supports: { speed: true, pitch: false, style: true }, provider: 'kokoro', engine: 'kokoro', browserHints: ['samantha', 'zira', 'jenny'] },
  { id: 'af_bella', gender: 'female', style: 'expressive-conversational', label: 'Bella (Kokoro)', description: 'Bright American female — expressive and clear.', languages: ['en'], supports: { speed: true, pitch: false, style: true }, provider: 'kokoro', engine: 'kokoro', browserHints: ['aria', 'flo', 'moira'] },
  { id: 'af_nicole', gender: 'female', style: 'calm-professional', label: 'Nicole (Kokoro)', description: 'Smooth American female — calm narration.', languages: ['en'], supports: { speed: true, pitch: false, style: true }, provider: 'kokoro', engine: 'kokoro', browserHints: ['sonia', 'catherine', 'hazel'] },
  { id: 'male-deep', gender: 'male', style: 'deep-confident', label: 'Deep & confident', description: 'Lower register, steady and assured.', languages: ['en', 'ru', 'uk'], supports: { speed: true, pitch: false, style: true }, provider: 'cloud', browserHints: ['david', 'mark', 'george', 'daniel', 'paul'] },
  { id: 'male-warm', gender: 'male', style: 'warm-friendly', label: 'Warm & friendly', description: 'Approachable tone for everyday conversation.', languages: ['en', 'ru', 'uk'], supports: { speed: true, pitch: false, style: true }, provider: 'cloud', browserHints: ['james', 'thomas', 'alex'] },
  { id: 'male-calm', gender: 'male', style: 'calm-professional', label: 'Calm & professional', description: 'Neutral delivery for explanations and briefings.', languages: ['en', 'ru', 'uk'], supports: { speed: true, pitch: false, style: true }, provider: 'cloud', browserHints: ['ryan', 'arthur', 'ravi'] },
  { id: 'male-expressive', gender: 'male', style: 'expressive-conversational', label: 'Expressive & conversational', description: 'More dynamic intonation for storytelling.', languages: ['en', 'ru', 'uk'], supports: { speed: true, pitch: false, style: true }, provider: 'cloud', browserHints: ['guy', 'tony', 'christopher'] },
  { id: 'female-soft', gender: 'female', style: 'soft-natural', label: 'Soft & natural', description: 'Gentle, natural cadence.', languages: ['en', 'ru', 'uk'], supports: { speed: true, pitch: false, style: true }, provider: 'cloud', browserHints: ['samantha', 'karen', 'zira', 'jenny'] },
  { id: 'female-warm', gender: 'female', style: 'warm-friendly', label: 'Warm & friendly', description: 'Welcoming and clear.', languages: ['en', 'ru', 'uk'], supports: { speed: true, pitch: false, style: true }, provider: 'cloud', browserHints: ['aria', 'emma', 'susan'] },
  { id: 'female-calm', gender: 'female', style: 'calm-professional', label: 'Calm & professional', description: 'Measured tone for technical answers.', languages: ['en', 'ru', 'uk'], supports: { speed: true, pitch: false, style: true }, provider: 'cloud', browserHints: ['sonia', 'catherine', 'hazel'] },
  { id: 'female-expressive', gender: 'female', style: 'expressive-conversational', label: 'Expressive & conversational', description: 'Livelier delivery for creative replies.', languages: ['en', 'ru', 'uk'], supports: { speed: true, pitch: false, style: true }, provider: 'cloud', browserHints: ['flo', 'moira'] },
];

export function getCuratedVoices() {
  return CURATED_VOICES;
}

export function cleanTextForSpeech(text) {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, ' Code block omitted. ')
    .replace(/https?:\/\/\S+/g, ' link ')
    .replace(/[#*_`>~|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function authHeaders() {
  return {
    Accept: 'application/json',
    ...nativeClientHeaders(),
    ...nativeSessionHeaders(),
    ...firebaseSessionFallbackHeaders(),
  };
}

function offlineCatalogFallback(extra = {}) {
  return {
    voices: CURATED_VOICES.map((voice) => {
      const publicVoice = { ...voice };
      delete publicVoice.browserHints;
      return publicVoice;
    }),
    languages: [
      { code: 'en', locale: 'en-US', label: 'English' },
      { code: 'ru', locale: 'ru-RU', label: 'Русский' },
      { code: 'uk', locale: 'uk-UA', label: 'Українська' },
    ],
    providers: { kokoro: false, openai: false, elevenlabs: false, browser: true },
    preferredEngine: 'browser',
    notes: {
      kokoro: 'Start the Python AI service with Kokoro for free local voices.',
      browser: 'Free device voices via speechSynthesis.',
      openai: 'Optional paid OpenAI TTS when explicitly selected.',
    },
    ...extra,
  };
}

/**
 * Public Express → Python Kokoro probe (no auth).
 */
export async function fetchTtsHealth() {
  const response = await fetch(resolveApiUrl('/api/tts/health'), {
    credentials: 'include',
    headers: { Accept: 'application/json', ...nativeClientHeaders() },
  });
  if (!response.ok) {
    const error = new Error(`TTS health unavailable (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

/**
 * Merge catalog + public health so Kokoro availability is correct even when
 * /api/tts/catalog requires auth and the session is still hydrating.
 */
export function mergeTtsCatalogWithHealth(catalog, health) {
  const base = catalog && typeof catalog === 'object' ? catalog : offlineCatalogFallback();
  if (!health || typeof health !== 'object') return base;
  const providers = {
    ...(base.providers || {}),
    ...(health.providers || {}),
  };
  return {
    ...base,
    ...health,
    providers,
    voices: Array.isArray(base.voices) && base.voices.length ? base.voices : (health.voices || base.voices),
    kokoro: health.kokoro || base.kokoro,
    preferredEngine: health.preferredEngine || base.preferredEngine,
    notes: { ...(base.notes || {}), ...(health.notes || {}) },
  };
}

export async function fetchTtsCatalog() {
  let catalog = null;
  let catalogError = null;
  try {
    const response = await fetch(resolveApiUrl('/api/tts/catalog'), {
      credentials: 'include',
      headers: authHeaders(),
    });
    if (!response.ok) {
      catalogError = new Error(`catalog unavailable (${response.status})`);
      catalogError.status = response.status;
    } else {
      catalog = await response.json();
    }
  } catch (error) {
    catalogError = error;
  }

  let health;
  try {
    health = await fetchTtsHealth();
  } catch {
    health = null;
  }

  if (catalog) {
    return mergeTtsCatalogWithHealth(catalog, health);
  }

  // Auth/session may still be loading (401) — health alone can still show Kokoro online.
  if (health) {
    return mergeTtsCatalogWithHealth(
      offlineCatalogFallback({
        catalogError: catalogError?.status || null,
        notes: {
          kokoro: health.notes?.kokoro
            || 'Kokoro status loaded from /api/tts/health. Sign in to sync voice preferences.',
          browser: 'Free device voices via speechSynthesis.',
          openai: 'Optional paid OpenAI TTS when explicitly selected.',
        },
      }),
      health,
    );
  }

  return offlineCatalogFallback({
    catalogError: catalogError?.status || null,
    notes: {
      kokoro: catalogError?.status === 404
        ? 'Backend TTS routes are missing — restart the Express server on port 5050.'
        : 'Start the Python AI service with Kokoro for free local voices.',
      browser: 'Free device voices via speechSynthesis.',
      openai: 'Optional paid OpenAI TTS when explicitly selected.',
    },
  });
}

export async function fetchVoicePreferencesRemote() {
  const response = await fetch(resolveApiUrl('/api/tts/preferences'), {
    credentials: 'include',
    headers: authHeaders(),
  });
  if (!response.ok) throw new Error('Could not load voice preferences');
  const data = await response.json();
  return data.preferences;
}

export async function saveVoicePreferencesRemote(prefs) {
  const response = await fetch(resolveApiUrl('/api/tts/preferences'), {
    method: 'PUT',
    credentials: 'include',
    headers: {
      ...authHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(prefs),
  });
  if (!response.ok) throw new Error('Could not save voice preferences');
  const data = await response.json();
  return data.preferences;
}

/**
 * Request server audio (Kokoro WAV or cloud MP3). Throws with fallback: 'browser' when free local is down.
 */
export async function requestCloudSpeech({ text, voiceId, language, speed, engine, signal } = {}) {
  const prefs = readLocalVoicePreferences();
  const response = await fetch(resolveApiUrl('/api/tts/speak'), {
    method: 'POST',
    credentials: 'include',
    signal,
    headers: {
      ...authHeaders(),
      'Content-Type': 'application/json',
      Accept: 'audio/wav, audio/mpeg, application/json',
    },
    body: JSON.stringify({
      text,
      voiceId: voiceId || prefs.voiceId,
      language: language || prefs.language,
      speed: speed ?? prefs.speed,
      engine: engine || prefs.engine,
    }),
  });

  if (response.status === 503) {
    const data = await response.json().catch(() => ({}));
    const error = new Error(data.message || 'Use browser speech');
    error.code = data.code || 'TTS_USE_BROWSER_FALLBACK';
    error.fallback = 'browser';
    throw error;
  }

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const error = new Error(data.message || `Speech failed (${response.status})`);
    error.code = data.code || 'TTS_FAILED';
    error.status = response.status;
    throw error;
  }

  const blob = await response.blob();
  const mime = blob.type || response.headers.get('Content-Type') || 'audio/mpeg';
  return {
    blob,
    objectUrl: URL.createObjectURL(blob),
    mimeType: mime,
    engine: response.headers.get('X-AllModelAI-TTS-Engine') || 'kokoro',
    voiceId: response.headers.get('X-AllModelAI-TTS-Voice') || voiceId,
    billed: response.headers.get('X-AllModelAI-TTS-Billed') === '1',
  };
}

export function matchBrowserVoice(profile, languageCode, deviceVoices) {
  const locale = languageToLocale(languageCode);
  const langPrefix = locale.split('-')[0].toLowerCase();
  const voices = Array.isArray(deviceVoices) ? deviceVoices : [];
  const hints = (profile?.browserHints || []).map((h) => String(h).toLowerCase());
  const byLang = voices.filter((v) => String(v.lang || '').toLowerCase().startsWith(langPrefix));
  const pool = byLang.length ? byLang : voices;

  const hinted = pool.find((v) => {
    const name = String(v.name || '').toLowerCase();
    return hints.some((hint) => name.includes(hint));
  });
  if (hinted) return hinted;

  const genderHint = profile?.gender === 'female'
    ? /(female|woman|zira|samantha|aria|jenny|karen)/i
    : /(male|david|mark|james|guy|daniel)/i;
  const gendered = pool.find((v) => genderHint.test(v.name || ''));
  return gendered || pool[0] || voices[0] || null;
}

export function resolveSpeechLanguage(prefs, text) {
  if (prefs?.language && prefs.language !== 'auto') {
    return { code: prefs.language, locale: languageToLocale(prefs.language) };
  }
  const code = detectTextLanguage(text);
  return { code, locale: languageToLocale(code) };
}

export function downloadAudioBlob(blob, filename = 'allmodelai-voice.wav') {
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
