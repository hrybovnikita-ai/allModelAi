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

const UI_LANGUAGE_TO_RESPONSE_PREF = {
  English: 'english',
  Russian: 'russian',
  Ukrainian: 'ukrainian',
  Polish: 'polish',
  German: 'german',
  French: 'french',
  Spanish: 'spanish',
  Italian: 'italian',
  Portuguese: 'portuguese',
  Chinese: 'chinese',
  Japanese: 'japanese',
  Arabic: 'arabic',
};

export function profileLanguageToResponsePref(profile = {}) {
  if (profile.responseLanguage) return profile.responseLanguage;
  const fromUi = UI_LANGUAGE_TO_RESPONSE_PREF[profile.language];
  return fromUi || 'auto';
}

export function readResponsePrefs(storage = typeof localStorage !== 'undefined' ? localStorage : null) {
  try {
    const raw = storage?.getItem('allmodelai_response_prefs');
    const parsed = raw ? JSON.parse(raw) : {};
    let profile = {};
    try {
      profile = JSON.parse(storage?.getItem('allmodelai_profile') || '{}') || {};
    } catch {
      profile = {};
    }
    const merged = { ...DEFAULT_RESPONSE_PREFS, ...(parsed && typeof parsed === 'object' ? parsed : {}) };
    // AI response language only — never map website UI language (e.g. Ukrainian UI) into model replies when auto-detect is on.
    merged.profileLanguage = merged.responseLanguage !== 'auto'
      ? merged.responseLanguage
      : (profile.responseLanguage && profile.responseLanguage !== 'auto' ? profile.responseLanguage : 'auto');
    return merged;
  } catch {
    return { ...DEFAULT_RESPONSE_PREFS, profileLanguage: 'auto' };
  }
}

export async function persistResponseLanguagePreference(responseLanguage, { storage, syncChatSettings } = {}) {
  const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  const prefs = readResponsePrefs(store);
  const next = { ...prefs, responseLanguage };
  writeResponsePrefs(next, store);
  try {
    const profile = JSON.parse(store?.getItem('allmodelai_profile') || '{}') || {};
    store?.setItem('allmodelai_profile', JSON.stringify({ ...profile, responseLanguage }));
  } catch {
    /* ignore */
  }
  if (typeof syncChatSettings === 'function') {
    await syncChatSettings({ responseLanguage });
  }
  return next;
}

export function writeResponsePrefs(prefs, storage = typeof localStorage !== 'undefined' ? localStorage : null) {
  try {
    storage?.setItem('allmodelai_response_prefs', JSON.stringify({ ...DEFAULT_RESPONSE_PREFS, ...prefs }));
  } catch {
    /* private mode */
  }
}
