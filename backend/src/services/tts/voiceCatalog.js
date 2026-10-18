/**
 * Curated AllModelAI voice profiles.
 * Kokoro (local free), cloud provider mappings, and browser voice hints.
 */

const KOKORO_VOICE_PROFILES = [
  {
    id: 'am_michael',
    gender: 'male',
    style: 'warm-friendly',
    label: 'Michael (Kokoro)',
    description: 'Warm American male — clear and conversational.',
    languages: ['en'],
    engine: 'kokoro',
    kokoroVoice: 'am_michael',
    browserHints: { gender: 'male', keywords: ['david', 'mark', 'james', 'microsoft david'] },
    supports: { speed: true, pitch: false, style: true },
  },
  {
    id: 'am_adam',
    gender: 'male',
    style: 'calm-professional',
    label: 'Adam (Kokoro)',
    description: 'Steady American male — calm and professional.',
    languages: ['en'],
    engine: 'kokoro',
    kokoroVoice: 'am_adam',
    browserHints: { gender: 'male', keywords: ['ryan', 'arthur', 'microsoft ryan'] },
    supports: { speed: true, pitch: false, style: true },
  },
  {
    id: 'af_heart',
    gender: 'female',
    style: 'soft-natural',
    label: 'Heart (Kokoro)',
    description: 'Soft American female — natural and friendly.',
    languages: ['en'],
    engine: 'kokoro',
    kokoroVoice: 'af_heart',
    browserHints: { gender: 'female', keywords: ['samantha', 'zira', 'jenny', 'microsoft zira'] },
    supports: { speed: true, pitch: false, style: true },
  },
  {
    id: 'af_bella',
    gender: 'female',
    style: 'expressive-conversational',
    label: 'Bella (Kokoro)',
    description: 'Bright American female — expressive and clear.',
    languages: ['en'],
    engine: 'kokoro',
    kokoroVoice: 'af_bella',
    browserHints: { gender: 'female', keywords: ['aria', 'flo', 'moira', 'microsoft aria'] },
    supports: { speed: true, pitch: false, style: true },
  },
  {
    id: 'af_nicole',
    gender: 'female',
    style: 'calm-professional',
    label: 'Nicole (Kokoro)',
    description: 'Smooth American female — calm narration.',
    languages: ['en'],
    engine: 'kokoro',
    kokoroVoice: 'af_nicole',
    browserHints: { gender: 'female', keywords: ['sonia', 'catherine', 'hazel', 'microsoft sonia'] },
    supports: { speed: true, pitch: false, style: true },
  },
];

const CLOUD_VOICE_PROFILES = [
  // Male
  {
    id: 'male-deep',
    gender: 'male',
    style: 'deep-confident',
    label: 'Deep & confident',
    description: 'Lower register, steady and assured.',
    languages: ['en', 'ru', 'uk'],
    openaiVoice: 'onyx',
    elevenLabsVoiceIdEnv: 'ELEVENLABS_VOICE_MALE_DEEP',
    browserHints: { gender: 'male', keywords: ['david', 'mark', 'george', 'daniel', 'paul', 'microsoft david', 'microsoft mark'] },
    supports: { speed: true, pitch: false, style: true },
  },
  {
    id: 'male-warm',
    gender: 'male',
    style: 'warm-friendly',
    label: 'Warm & friendly',
    description: 'Approachable tone for everyday conversation.',
    languages: ['en', 'ru', 'uk'],
    openaiVoice: 'echo',
    elevenLabsVoiceIdEnv: 'ELEVENLABS_VOICE_MALE_WARM',
    browserHints: { gender: 'male', keywords: ['james', 'thomas', 'alex', 'microsoft james'] },
    supports: { speed: true, pitch: false, style: true },
  },
  {
    id: 'male-calm',
    gender: 'male',
    style: 'calm-professional',
    label: 'Calm & professional',
    description: 'Neutral delivery for explanations and briefings.',
    languages: ['en', 'ru', 'uk'],
    openaiVoice: 'ash',
    elevenLabsVoiceIdEnv: 'ELEVENLABS_VOICE_MALE_CALM',
    browserHints: { gender: 'male', keywords: ['ryan', 'arthur', 'ravi', 'microsoft ryan'] },
    supports: { speed: true, pitch: false, style: true },
  },
  {
    id: 'male-expressive',
    gender: 'male',
    style: 'expressive-conversational',
    label: 'Expressive & conversational',
    description: 'More dynamic intonation for storytelling.',
    languages: ['en', 'ru', 'uk'],
    openaiVoice: 'fable',
    elevenLabsVoiceIdEnv: 'ELEVENLABS_VOICE_MALE_EXPRESSIVE',
    browserHints: { gender: 'male', keywords: ['guy', 'tony', 'christopher'] },
    supports: { speed: true, pitch: false, style: true },
  },
  // Female
  {
    id: 'female-soft',
    gender: 'female',
    style: 'soft-natural',
    label: 'Soft & natural',
    description: 'Gentle, natural cadence.',
    languages: ['en', 'ru', 'uk'],
    openaiVoice: 'nova',
    elevenLabsVoiceIdEnv: 'ELEVENLABS_VOICE_FEMALE_SOFT',
    browserHints: { gender: 'female', keywords: ['samantha', 'karen', 'zira', 'microsoft zira', 'microsoft jenny'] },
    supports: { speed: true, pitch: false, style: true },
  },
  {
    id: 'female-warm',
    gender: 'female',
    style: 'warm-friendly',
    label: 'Warm & friendly',
    description: 'Welcoming and clear.',
    languages: ['en', 'ru', 'uk'],
    openaiVoice: 'coral',
    elevenLabsVoiceIdEnv: 'ELEVENLABS_VOICE_FEMALE_WARM',
    browserHints: { gender: 'female', keywords: ['aria', 'emma', 'susan', 'microsoft aria'] },
    supports: { speed: true, pitch: false, style: true },
  },
  {
    id: 'female-calm',
    gender: 'female',
    style: 'calm-professional',
    label: 'Calm & professional',
    description: 'Measured tone for technical answers.',
    languages: ['en', 'ru', 'uk'],
    openaiVoice: 'sage',
    elevenLabsVoiceIdEnv: 'ELEVENLABS_VOICE_FEMALE_CALM',
    browserHints: { gender: 'female', keywords: ['sonia', 'catherine', 'hazel', 'microsoft sonia'] },
    supports: { speed: true, pitch: false, style: true },
  },
  {
    id: 'female-expressive',
    gender: 'female',
    style: 'expressive-conversational',
    label: 'Expressive & conversational',
    description: 'Livelier delivery for creative replies.',
    languages: ['en', 'ru', 'uk'],
    openaiVoice: 'shimmer',
    elevenLabsVoiceIdEnv: 'ELEVENLABS_VOICE_FEMALE_EXPRESSIVE',
    browserHints: { gender: 'female', keywords: ['flo', 'moira', 'google uk english female'] },
    supports: { speed: true, pitch: false, style: true },
  },
];

/** Runtime-filtered; starts with curated Kokoro list until Python probes. */
let kokoroVoicesEnabled = null;

const VOICE_PROFILES = [...KOKORO_VOICE_PROFILES, ...CLOUD_VOICE_PROFILES];

const SUPPORTED_LANGUAGES = [
  { code: 'en', locale: 'en-US', label: 'English' },
  { code: 'ru', locale: 'ru-RU', label: 'Русский' },
  { code: 'uk', locale: 'uk-UA', label: 'Українська' },
];

function setKokoroAvailability(availableVoiceIds) {
  if (availableVoiceIds === false) {
    kokoroVoicesEnabled = new Set();
    return;
  }
  if (!availableVoiceIds) {
    kokoroVoicesEnabled = null;
    return;
  }
  kokoroVoicesEnabled = new Set(
    (Array.isArray(availableVoiceIds) ? availableVoiceIds : [])
      .map((id) => String(id || '').trim())
      .filter(Boolean),
  );
}

function isKokoroVoice(profile) {
  return Boolean(profile?.kokoroVoice || profile?.engine === 'kokoro');
}

function listVoiceProfiles({ includeUnavailableKokoro = false } = {}) {
  return VOICE_PROFILES
    .filter((profile) => {
      if (!isKokoroVoice(profile)) return true;
      if (includeUnavailableKokoro) return true;
      if (kokoroVoicesEnabled === null) return true;
      return kokoroVoicesEnabled.has(profile.id);
    })
    .map((profile) => ({
      id: profile.id,
      gender: profile.gender,
      style: profile.style,
      label: profile.label,
      description: profile.description,
      languages: profile.languages,
      supports: profile.supports,
      engine: profile.engine || (profile.kokoroVoice ? 'kokoro' : undefined),
      provider: profile.kokoroVoice ? 'kokoro' : 'cloud',
    }));
}

function getVoiceProfile(voiceId) {
  return VOICE_PROFILES.find((profile) => profile.id === voiceId) || null;
}

function resolveProviderAvailability(kokoroAvailable = false) {
  const openAiKey = String(process.env.OPENAI_API_KEY || process.env.OPEN_AI_API_KEY || '').trim();
  const elevenKey = String(process.env.ELEVENLABS_API_KEY || '').trim();
  return {
    kokoro: Boolean(kokoroAvailable),
    openai: Boolean(openAiKey),
    elevenlabs: Boolean(elevenKey),
    browser: true,
  };
}

/**
 * Auto prefers free local Kokoro, then free browser.
 * Paid engines only when the user explicitly requests them.
 */
function pickPreferredEngine(requested, { kokoroAvailable = false } = {}) {
  const available = resolveProviderAvailability(kokoroAvailable);
  if (requested && available[requested]) return requested;
  if (available.kokoro) return 'kokoro';
  return 'browser';
}

module.exports = {
  VOICE_PROFILES,
  KOKORO_VOICE_PROFILES,
  CLOUD_VOICE_PROFILES,
  SUPPORTED_LANGUAGES,
  listVoiceProfiles,
  getVoiceProfile,
  resolveProviderAvailability,
  pickPreferredEngine,
  setKokoroAvailability,
  isKokoroVoice,
};
