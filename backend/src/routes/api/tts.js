/**
 * AllModelAI TTS routes — mounted at /api/tts
 *
 * Public:  GET  /api/tts/health
 * Auth:    GET  /api/tts/catalog
 *          GET/PUT /api/tts/preferences
 *          POST /api/tts/detect-language
 *          POST /api/tts/speak
 *
 * Flow: React → Express (this router) → Python http://127.0.0.1:${AI_PYTHON_PORT}/tts/*
 */
const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const { createUserRateLimitMiddleware } = require('../../security/apiRateLimit');
const {
  getTtsHealth,
  getTtsCatalog,
  getVoicePrefs,
  putVoicePrefs,
  postTtsSpeak,
  postTtsDetectLanguage,
} = require('../../controllers/ttsController');

const expensiveUserRateLimit = createUserRateLimitMiddleware({ scope: 'expensive' });
const router = express.Router();

router.get('/health', getTtsHealth);
router.get('/catalog', requireAuth, getTtsCatalog);
router.get('/preferences', requireAuth, getVoicePrefs);
router.put('/preferences', requireAuth, putVoicePrefs);
router.post('/detect-language', requireAuth, postTtsDetectLanguage);
router.post('/speak', requireAuth, expensiveUserRateLimit, postTtsSpeak);

if (process.env.NODE_ENV !== 'test') {
  console.log('[TTS] Router ready: GET /api/tts/health (public), /catalog|/speak (auth)');
}

module.exports = router;
