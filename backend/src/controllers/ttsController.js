const crypto = require('node:crypto');
const {
  listVoiceProfiles,
  SUPPORTED_LANGUAGES,
  getVoiceProfile,
} = require('../services/tts/voiceCatalog');
const {
  synthesizeSpeech,
  getTtsStatus,
  detectLanguageCode,
  cleanTextForSpeech,
  clampSpeed,
} = require('../services/tts/ttsService');
const { isPostgresConnection } = require('../db/postgresHttpReads');
const {
  listWorkspaceItemRows,
} = require('../db/postgresHttpReads');

const PREFS_TYPE = 'voice_prefs';

function defaultPreferences() {
  return {
    voiceId: 'af_heart',
    language: 'auto',
    speed: 1,
    style: 'soft-natural',
    autoPlay: false,
    engine: 'auto',
  };
}

function sanitizePreferences(input = {}) {
  const base = defaultPreferences();
  const voiceId = String(input.voiceId || base.voiceId);
  const profile = getVoiceProfile(voiceId);
  const language = ['auto', 'en', 'ru', 'uk'].includes(input.language) ? input.language : base.language;
  const engine = ['auto', 'kokoro', 'openai', 'elevenlabs', 'browser'].includes(input.engine)
    ? input.engine
    : base.engine;
  return {
    voiceId: profile ? profile.id : base.voiceId,
    language,
    speed: clampSpeed(input.speed ?? base.speed),
    style: profile?.style || base.style,
    autoPlay: Boolean(input.autoPlay),
    engine,
  };
}

async function loadVoicePreferences(connection, email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return defaultPreferences();

  if (isPostgresConnection(connection)) {
    const rows = await listWorkspaceItemRows(connection, normalized, PREFS_TYPE);
    const row = rows[0];
    if (!row) return defaultPreferences();
    const data = typeof row.data === 'string' ? JSON.parse(row.data) : (row.data || {});
    return sanitizePreferences(data);
  }

  const row = connection.database
    .prepare('SELECT data FROM workspace_items WHERE email = ? AND type = ? ORDER BY updated_at DESC LIMIT 1')
    .get(normalized, PREFS_TYPE);
  if (!row?.data) return defaultPreferences();
  try {
    return sanitizePreferences(JSON.parse(row.data));
  } catch {
    return defaultPreferences();
  }
}

async function saveVoicePreferences(connection, email, prefs) {
  const normalized = String(email || '').trim().toLowerCase();
  const payload = sanitizePreferences(prefs);
  const now = new Date().toISOString();
  const dataJson = JSON.stringify(payload);

  if (isPostgresConnection(connection)) {
    const { queryPgPool, resolvePostgresAsyncPool } = require('../db/pgPoolQuery');
    const pool = resolvePostgresAsyncPool(connection);
    const existing = await listWorkspaceItemRows(connection, normalized, PREFS_TYPE);
    if (existing[0]?.id) {
      await queryPgPool(
        pool,
        'UPDATE workspace_items SET data = $1, updated_at = $2 WHERE id = $3 AND email = $4',
        [dataJson, now, existing[0].id, normalized],
      );
    } else {
      const id = `voice-prefs-${crypto.randomUUID()}`;
      await queryPgPool(
        pool,
        `INSERT INTO workspace_items (id, email, type, data, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, normalized, PREFS_TYPE, dataJson, now, now],
      );
    }
    return payload;
  }

  const existing = connection.database
    .prepare('SELECT id FROM workspace_items WHERE email = ? AND type = ? ORDER BY updated_at DESC LIMIT 1')
    .get(normalized, PREFS_TYPE);
  if (existing?.id) {
    connection.database
      .prepare('UPDATE workspace_items SET data = ?, updated_at = ? WHERE id = ?')
      .run(dataJson, now, existing.id);
  } else {
    connection.database
      .prepare('INSERT INTO workspace_items (id, email, type, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(`voice-prefs-${crypto.randomUUID()}`, normalized, PREFS_TYPE, dataJson, now, now);
  }
  return payload;
}

/**
 * Public Kokoro/status probe — no auth so Voice Studio can detect local TTS
 * even before session hydration. Does not expose the Python service directly.
 */
const getTtsHealth = async (_req, res) => {
  try {
    const status = await getTtsStatus({ force: true });
    return res.json({
      ok: true,
      service: 'allmodelai-tts',
      ...status,
    });
  } catch (error) {
    return res.status(503).json({
      ok: false,
      service: 'allmodelai-tts',
      providers: { kokoro: false, openai: false, elevenlabs: false, browser: true },
      preferredEngine: 'browser',
      kokoro: {
        available: false,
        ready: false,
        error: error.message || 'TTS health check failed',
      },
    });
  }
};

const getTtsCatalog = async (_req, res) => {
  const status = await getTtsStatus({ force: true });
  return res.json({
    voices: listVoiceProfiles(),
    languages: SUPPORTED_LANGUAGES,
    ...status,
  });
};

const getVoicePrefs = async (req, res) => {
  try {
    const prefs = await loadVoicePreferences(req.app.locals.db, req.user.email);
    return res.json({ preferences: prefs });
  } catch (error) {
    return res.status(500).json({ message: 'Could not load voice preferences.' });
  }
};

const putVoicePrefs = async (req, res) => {
  try {
    const prefs = await saveVoicePreferences(req.app.locals.db, req.user.email, req.body || {});
    return res.json({ preferences: prefs, message: 'Voice preferences saved.' });
  } catch (error) {
    return res.status(500).json({ message: 'Could not save voice preferences.' });
  }
};

const postTtsSpeak = async (req, res) => {
  const text = cleanTextForSpeech(req.body?.text);
  if (!text) {
    return res.status(400).json({ code: 'TTS_EMPTY_TEXT', message: 'Provide text to speak.' });
  }

  const prefs = await loadVoicePreferences(req.app.locals.db, req.user.email).catch(() => defaultPreferences());
  const voiceId = String(req.body?.voiceId || prefs.voiceId);
  const language = req.body?.language === 'auto' || !req.body?.language
    ? detectLanguageCode(text)
    : req.body.language;
  const speed = clampSpeed(req.body?.speed ?? prefs.speed);
  const engine = req.body?.engine === 'auto' ? prefs.engine : (req.body?.engine || prefs.engine);

  const controller = new AbortController();
  req.on('close', () => {
    if (!res.writableEnded) controller.abort();
  });

  try {
    const result = await synthesizeSpeech({
      text,
      voiceId,
      language,
      speed,
      engine: engine === 'auto' ? undefined : engine,
      signal: controller.signal,
    });

    res.setHeader('Content-Type', result.mimeType || 'audio/mpeg');
    res.setHeader('Cache-Control', 'private, max-age=0, no-store');
    res.setHeader('X-AllModelAI-TTS-Engine', result.engine);
    res.setHeader('X-AllModelAI-TTS-Voice', result.voiceId);
    res.setHeader('X-AllModelAI-TTS-Cached', result.cached ? '1' : '0');
    res.setHeader('X-AllModelAI-TTS-Billed', result.billed ? '1' : '0');
    return res.status(200).send(result.audio);
  } catch (error) {
    if (error.name === 'AbortError') {
      return res.status(499).json({ code: 'TTS_CANCELLED', message: 'Speech request cancelled.' });
    }
    if (error.code === 'TTS_USE_BROWSER_FALLBACK') {
      return res.status(503).json({
        code: error.code,
        message: error.message,
        fallback: 'browser',
        voiceId,
        language,
        speed,
      });
    }
    const status = error.status && error.status >= 400 && error.status < 600 ? error.status : 502;
    return res.status(status).json({
      code: error.code || 'TTS_FAILED',
      message: error.message || 'Could not generate speech.',
    });
  }
};

const postTtsDetectLanguage = async (req, res) => {
  const text = String(req.body?.text || '');
  return res.json({ language: detectLanguageCode(text) });
};

module.exports = {
  getTtsHealth,
  getTtsCatalog,
  getVoicePrefs,
  putVoicePrefs,
  postTtsSpeak,
  postTtsDetectLanguage,
  sanitizePreferences,
  defaultPreferences,
  detectLanguageCode,
  cleanTextForSpeech,
};
