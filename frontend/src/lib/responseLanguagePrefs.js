/** AI response language (not website UI language). Stored in allmodelai_response_prefs.responseLanguage */

export const RESPONSE_LANGUAGE_OPTIONS = [
  { value: 'auto', label: 'Auto-detect' },
  { value: 'english', label: 'English' },
  { value: 'ukrainian', label: 'Ukrainian' },
  { value: 'russian', label: 'Russian' },
  { value: 'spanish', label: 'Spanish' },
  { value: 'french', label: 'French' },
  { value: 'german', label: 'German' },
  { value: 'polish', label: 'Polish' },
  { value: 'italian', label: 'Italian' },
  { value: 'portuguese', label: 'Portuguese' },
  { value: 'chinese', label: 'Chinese' },
  { value: 'japanese', label: 'Japanese' },
  { value: 'korean', label: 'Korean' },
  { value: 'arabic', label: 'Arabic' },
];

export const DEFAULT_RESPONSE_PREFS = {
  length: 'balanced',
  tone: 'clear',
  creativity: 'balanced',
  format: 'auto',
  responseLanguage: 'auto',
};

export function readResponsePrefs(storage = typeof localStorage !== 'undefined' ? localStorage : null) {
  try {
    const raw = storage?.getItem('allmodelai_response_prefs');
    const parsed = raw ? JSON.parse(raw) : {};
    return { ...DEFAULT_RESPONSE_PREFS, ...(parsed && typeof parsed === 'object' ? parsed : {}) };
  } catch {
    return { ...DEFAULT_RESPONSE_PREFS };
  }
}

export function writeResponsePrefs(prefs, storage = typeof localStorage !== 'undefined' ? localStorage : null) {
  try {
    storage?.setItem('allmodelai_response_prefs', JSON.stringify({ ...DEFAULT_RESPONSE_PREFS, ...prefs }));
  } catch {
    /* private mode */
  }
}
