const STORAGE_KEY = 'allmodelai_voice_studio_prefs';

export const DEFAULT_VOICE_PREFS = Object.freeze({
  voiceId: 'af_heart',
  language: 'auto',
  speed: 1,
  style: 'soft-natural',
  autoPlay: false,
  engine: 'auto',
});

export function readLocalVoicePreferences() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_VOICE_PREFS };
    return { ...DEFAULT_VOICE_PREFS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_VOICE_PREFS };
  }
}

export function writeLocalVoicePreferences(prefs) {
  const next = { ...DEFAULT_VOICE_PREFS, ...prefs };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    // Keep chat voice panel keys loosely in sync
    if (next.language && next.language !== 'auto') {
      const locale = next.language === 'ru' ? 'ru-RU' : next.language === 'uk' ? 'uk-UA' : 'en-US';
      localStorage.setItem('allmodelai_voice_language', locale);
    }
    localStorage.setItem('allmodelai_voice_name', next.voiceId || '');
  } catch {
    /* private mode */
  }
  return next;
}

export function detectTextLanguage(text) {
  const sample = String(text || '').slice(0, 800);
  if (/[іІїЇєЄґҐ]/.test(sample)) return 'uk';
  if (/[ыэёъЫЭЁЪ]/.test(sample) || /[а-яА-ЯёЁ]{4,}/.test(sample)) return 'ru';
  if (/[а-яА-ЯіІїЇєЄґҐ]/.test(sample)) return 'uk';
  return 'en';
}

export function languageToLocale(code) {
  if (code === 'ru') return 'ru-RU';
  if (code === 'uk') return 'uk-UA';
  return 'en-US';
}
