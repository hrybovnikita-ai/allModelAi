const crypto = require('node:crypto');
const {
  getVoiceProfile,
  pickPreferredEngine,
  resolveProviderAvailability,
  setKokoroAvailability,
  isKokoroVoice,
  KOKORO_VOICE_PROFILES,
} = require('./voiceCatalog');
const {
  ensureServerRunning,
  fetchPython,
  isServerHealthy,
  PYTHON_BASE_URL,
} = require('../aiPythonBridge');

const MAX_TTS_CHARS = Math.min(8000, Number(process.env.TTS_MAX_CHARS || 4000));
const OPENAI_TTS_MODEL = String(process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts').trim();
const OPENAI_TTS_FALLBACK_MODEL = String(process.env.OPENAI_TTS_FALLBACK_MODEL || 'tts-1-hd').trim();
const KOKORO_FETCH_TIMEOUT_MS = Math.max(
  15_000,
  Number(process.env.TTS_KOKORO_TIMEOUT_MS || 120_000),
);

const memoryAudioCache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 40;

let kokoroStatusCache = { checkedAt: 0, status: null };
const KOKORO_STATUS_TTL_MS = 15_000;

function cleanTextForSpeech(text) {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, ' Code block omitted. ')
    .replace(/https?:\/\/\S+/g, ' link ')
    .replace(/[#*_`>~|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function detectLanguageCode(text) {
  const sample = String(text || '').slice(0, 800);
  if (/[іІїЇєЄґҐ]/.test(sample)) return 'uk';
  if (/[ыэёъЫЭЁЪ]/.test(sample) || /[а-яА-ЯёЁ]{4,}/.test(sample)) return 'ru';
  if (/[а-яА-ЯіІїЇєЄґҐ]/.test(sample)) return 'uk';
  return 'en';
}

function clampSpeed(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.min(1.5, Math.max(0.7, n));
}

function cacheKey({ engine, voiceId, language, speed, text }) {
  return crypto
    .createHash('sha256')
    .update([engine, voiceId, language, String(speed), text].join('|'))
    .digest('hex');
}

function readCache(key) {
  const hit = memoryAudioCache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    memoryAudioCache.delete(key);
    return null;
  }
  return hit;
}

function writeCache(key, payload) {
  if (memoryAudioCache.size >= CACHE_MAX_ENTRIES) {
    const oldest = memoryAudioCache.keys().next().value;
    memoryAudioCache.delete(oldest);
  }
  memoryAudioCache.set(key, { ...payload, expiresAt: Date.now() + CACHE_TTL_MS });
}

function resolveKokoroVoiceId(voiceId) {
  const profile = getVoiceProfile(voiceId);
  if (profile?.kokoroVoice) return profile.kokoroVoice;
  const match = KOKORO_VOICE_PROFILES.find((v) => v.id === voiceId);
  return match?.kokoroVoice || null;
}

async function probeKokoroStatus({ force = false, startIfNeeded = false } = {}) {
  const now = Date.now();
  if (!force && kokoroStatusCache.status && now - kokoroStatusCache.checkedAt < KOKORO_STATUS_TTL_MS) {
    return kokoroStatusCache.status;
  }

  const unavailable = {
    available: false,
    ready: false,
    voices: [],
    error: `Python Kokoro service unavailable at ${PYTHON_BASE_URL}/tts/health`,
    pythonBaseUrl: PYTHON_BASE_URL,
  };

  try {
    let healthy = await isServerHealthy();
    if (!healthy && startIfNeeded) {
      healthy = await ensureServerRunning();
    }
    if (!healthy) {
      setKokoroAvailability(false);
      kokoroStatusCache = { checkedAt: now, status: unavailable };
      return unavailable;
    }

    const res = await fetchPython('/tts/health', {}, 8_000);
    if (!res.ok) {
      const failed = {
        ...unavailable,
        error: `Python /tts/health returned HTTP ${res.status} from ${PYTHON_BASE_URL}`,
      };
      setKokoroAvailability(false);
      kokoroStatusCache = { checkedAt: now, status: failed };
      return failed;
    }
    const data = await res.json();
    const voices = Array.isArray(data.voices)
      ? data.voices.filter((v) => v?.available !== false).map((v) => v.id || v)
      : KOKORO_VOICE_PROFILES.map((v) => v.id);

    if (data.available) {
      setKokoroAvailability(voices);
    } else {
      setKokoroAvailability(false);
    }

    const status = {
      available: Boolean(data.available),
      ready: Boolean(data.ready ?? data.available),
      voices,
      error: data.error || null,
      model: data.model || 'Kokoro-82M',
      sampleRate: data.sample_rate || 24000,
      pythonBaseUrl: PYTHON_BASE_URL,
    };
    kokoroStatusCache = { checkedAt: now, status };
    return status;
  } catch (error) {
    const status = {
      ...unavailable,
      error: `${error.message || unavailable.error} (${PYTHON_BASE_URL})`,
    };
    setKokoroAvailability(false);
    kokoroStatusCache = { checkedAt: now, status };
    return status;
  }
}

async function synthesizeKokoro({ text, voiceId, speed, signal }) {
  const kokoroVoice = resolveKokoroVoiceId(voiceId) || 'am_michael';
  const profile = getVoiceProfile(voiceId) || getVoiceProfile(kokoroVoice);

  const started = await ensureServerRunning();
  if (!started) {
    const error = new Error('Local Kokoro TTS service is not running.');
    error.code = 'TTS_USE_BROWSER_FALLBACK';
    error.status = 503;
    error.fallback = 'browser';
    throw error;
  }

  const res = await fetchPython(
    '/tts/synthesize',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'audio/wav, application/json' },
      body: JSON.stringify({
        text,
        voice: kokoroVoice,
        speed: clampSpeed(speed),
      }),
      signal,
    },
    KOKORO_FETCH_TIMEOUT_MS,
  );

  const contentType = String(res.headers.get('content-type') || '');
  if (!res.ok || contentType.includes('application/json')) {
    const payload = await res.json().catch(() => ({}));
    const message = payload.error || payload.message || `Kokoro TTS failed (${res.status}).`;
    if (payload.code === 'TTS_BAD_REQUEST' || res.status === 400) {
      const error = new Error(message);
      error.code = 'TTS_INVALID_VOICE';
      error.status = 400;
      throw error;
    }
    const error = new Error(message);
    error.code = 'TTS_USE_BROWSER_FALLBACK';
    error.status = 503;
    error.fallback = 'browser';
    throw error;
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  if (!buffer.length) {
    const error = new Error('Kokoro returned empty audio.');
    error.code = 'TTS_PROVIDER_ERROR';
    throw error;
  }

  return {
    engine: 'kokoro',
    mimeType: 'audio/wav',
    audio: buffer,
    voiceId: profile?.id || kokoroVoice,
    providerVoice: kokoroVoice,
    model: res.headers.get('X-AllModelAI-TTS-Model') || 'Kokoro-82M',
    billed: false,
  };
}

async function synthesizeOpenAi({ text, voiceId, speed, signal }) {
  const apiKey = String(process.env.OPENAI_API_KEY || process.env.OPEN_AI_API_KEY || '').trim();
  if (!apiKey) {
    const error = new Error('OpenAI TTS is not configured.');
    error.code = 'TTS_PROVIDER_UNAVAILABLE';
    throw error;
  }
  const profile = getVoiceProfile(voiceId) || getVoiceProfile('female-soft');
  const voice = profile.openaiVoice || 'nova';
  const models = [OPENAI_TTS_MODEL, OPENAI_TTS_FALLBACK_MODEL].filter(Boolean);
  let lastError = null;

  for (const model of [...new Set(models)]) {
    try {
      const body = {
        model,
        input: text,
        voice,
        response_format: 'mp3',
      };
      body.speed = clampSpeed(speed);

      const response = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal,
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        const error = new Error(`OpenAI TTS failed (${response.status}).`);
        error.code = response.status === 429 ? 'TTS_QUOTA_EXCEEDED' : 'TTS_PROVIDER_ERROR';
        error.status = response.status;
        error.detail = detail.slice(0, 240);
        lastError = error;
        continue;
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      return {
        engine: 'openai',
        mimeType: 'audio/mpeg',
        audio: buffer,
        voiceId: profile.id,
        providerVoice: voice,
        model,
        billed: true,
      };
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      lastError = error;
    }
  }

  throw lastError || new Error('OpenAI TTS failed.');
}

async function synthesizeElevenLabs({ text, voiceId, language, signal }) {
  const apiKey = String(process.env.ELEVENLABS_API_KEY || '').trim();
  if (!apiKey) {
    const error = new Error('ElevenLabs TTS is not configured.');
    error.code = 'TTS_PROVIDER_UNAVAILABLE';
    throw error;
  }
  const profile = getVoiceProfile(voiceId) || getVoiceProfile('female-soft');
  const mappedVoice = String(process.env[profile.elevenLabsVoiceIdEnv] || '').trim()
    || String(process.env.ELEVENLABS_DEFAULT_VOICE_ID || '').trim();
  if (!mappedVoice) {
    const error = new Error('ElevenLabs voice id is not configured for this profile.');
    error.code = 'TTS_VOICE_UNCONFIGURED';
    throw error;
  }

  const modelId = String(process.env.ELEVENLABS_TTS_MODEL || 'eleven_multilingual_v2').trim();
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${mappedVoice}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      Accept: 'audio/mpeg',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
      voice_settings: {
        stability: 0.4,
        similarity_boost: 0.75,
        style: profile.style.includes('expressive') ? 0.45 : 0.2,
        use_speaker_boost: true,
      },
      language_code: language || undefined,
    }),
    signal,
  });

  if (!response.ok) {
    const error = new Error(`ElevenLabs TTS failed (${response.status}).`);
    error.code = response.status === 429 ? 'TTS_QUOTA_EXCEEDED' : 'TTS_PROVIDER_ERROR';
    error.status = response.status;
    throw error;
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  return {
    engine: 'elevenlabs',
    mimeType: 'audio/mpeg',
    audio: buffer,
    voiceId: profile.id,
    providerVoice: mappedVoice,
    model: modelId,
    billed: true,
  };
}

/**
 * Server-side synthesis. Browser engine is handled on the client.
 * Auto prefers Kokoro (local free), then browser — never auto-picks paid engines.
 */
async function synthesizeSpeech({
  text,
  voiceId = 'af_heart',
  language,
  speed = 1,
  engine,
  signal,
} = {}) {
  const cleaned = cleanTextForSpeech(text);
  if (!cleaned) {
    const error = new Error('Nothing to speak.');
    error.code = 'TTS_EMPTY_TEXT';
    error.status = 400;
    throw error;
  }
  if (cleaned.length > MAX_TTS_CHARS) {
    const error = new Error(`Text is too long for speech (max ${MAX_TTS_CHARS} characters).`);
    error.code = 'TTS_TEXT_TOO_LONG';
    error.status = 400;
    throw error;
  }

  const lang = ['en', 'ru', 'uk'].includes(language) ? language : detectLanguageCode(cleaned);
  const profile = getVoiceProfile(voiceId);
  if (voiceId && !profile) {
    const error = new Error(`Unknown voice id: ${voiceId}`);
    error.code = 'TTS_INVALID_VOICE';
    error.status = 400;
    throw error;
  }

  // Warm the local Python service only when synthesis actually needs Kokoro.
  const wantsKokoro = !engine || engine === 'auto' || engine === 'kokoro' || isKokoroVoice(profile);
  const kokoro = await probeKokoroStatus({ startIfNeeded: wantsKokoro && engine !== 'browser' });
  let requested = engine === 'browser' ? 'browser' : engine;
  if (!requested && isKokoroVoice(profile)) {
    requested = 'kokoro';
  }
  const preferred = pickPreferredEngine(
    requested === 'auto' || !requested ? null : requested,
    { kokoroAvailable: kokoro.available },
  );

  if (preferred === 'browser') {
    const error = new Error('No local Kokoro TTS available. Use browser speechSynthesis.');
    error.code = 'TTS_USE_BROWSER_FALLBACK';
    error.status = 503;
    error.fallback = 'browser';
    throw error;
  }

  const key = cacheKey({
    engine: preferred,
    voiceId: profile?.id || voiceId,
    language: lang,
    speed: clampSpeed(speed),
    text: cleaned,
  });
  const cached = readCache(key);
  if (cached) {
    return { ...cached, cached: true };
  }

  let result;
  if (preferred === 'kokoro') {
    result = await synthesizeKokoro({
      text: cleaned,
      voiceId: profile?.id || voiceId,
      speed: clampSpeed(speed),
      signal,
    });
  } else if (preferred === 'elevenlabs') {
    result = await synthesizeElevenLabs({
      text: cleaned,
      voiceId: profile?.id || voiceId,
      language: lang,
      signal,
    });
  } else if (preferred === 'openai') {
    result = await synthesizeOpenAi({
      text: cleaned,
      voiceId: profile?.id || voiceId,
      speed: clampSpeed(speed),
      signal,
    });
  } else {
    const error = new Error('No TTS engine available.');
    error.code = 'TTS_USE_BROWSER_FALLBACK';
    error.status = 503;
    error.fallback = 'browser';
    throw error;
  }

  writeCache(key, result);
  return { ...result, language: lang, cached: false };
}

async function getTtsStatus({ force = false } = {}) {
  const kokoro = await probeKokoroStatus({ force });
  const providers = resolveProviderAvailability(kokoro.available);
  return {
    providers,
    preferredEngine: pickPreferredEngine(null, { kokoroAvailable: kokoro.available }),
    maxChars: MAX_TTS_CHARS,
    openaiModel: OPENAI_TTS_MODEL,
    kokoro: {
      available: kokoro.available,
      ready: kokoro.ready,
      model: kokoro.model || 'Kokoro-82M',
      voices: kokoro.voices || [],
      error: kokoro.error || null,
      sampleRate: kokoro.sampleRate || 24000,
      pythonBaseUrl: kokoro.pythonBaseUrl || PYTHON_BASE_URL,
    },
    notes: {
      kokoro: kokoro.available
        ? 'Free local Kokoro-82M voices via the Python AI service (no API key).'
        : `Start Python on ${PYTHON_BASE_URL} (AI_PYTHON_PORT must match). ${kokoro.error || ''}`.trim(),
      browser: 'Free device voices via speechSynthesis (quality varies by OS/browser).',
      openai: providers.openai
        ? 'Optional paid OpenAI TTS when explicitly selected.'
        : 'Optional: set OPENAI_API_KEY for cloud TTS (manual engine selection).',
      elevenlabs: providers.elevenlabs
        ? 'Optional paid ElevenLabs TTS when explicitly selected.'
        : 'Optional: set ELEVENLABS_API_KEY for premium voices (manual engine selection).',
    },
  };
}

module.exports = {
  MAX_TTS_CHARS,
  cleanTextForSpeech,
  detectLanguageCode,
  clampSpeed,
  synthesizeSpeech,
  getTtsStatus,
  probeKokoroStatus,
  resolveKokoroVoiceId,
};
