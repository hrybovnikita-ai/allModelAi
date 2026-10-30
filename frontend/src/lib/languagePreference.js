import { LANGUAGES, applyLanguage } from './languages.js';

export const LANGUAGE_KEY = 'allmodelai_language';
export const PROFILE_KEY = 'allmodelai_profile';
const CHANGE_EVENT = 'allmodelai-language-change';
export const resolveLanguage = (value) =>
  LANGUAGES.find((language) => language.name === value || language.code === value) || LANGUAGES[0];

function readJson(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function isKnownLanguage(value) {
  const raw = String(value ?? '').trim();
  if (!raw || raw.startsWith('{') || raw.startsWith('[')) return false;
  return LANGUAGES.some((language) => language.name === raw || language.code === raw);
}

function sanitizeLanguageStorage() {
  if (typeof localStorage === 'undefined') return;
  try {
    const saved = localStorage.getItem(LANGUAGE_KEY);
    if (saved && !isKnownLanguage(saved)) {
      localStorage.removeItem(LANGUAGE_KEY);
    }
    const profile = readJson(PROFILE_KEY);
    if (profile.language != null && !isKnownLanguage(profile.language)) {
      localStorage.setItem(PROFILE_KEY, JSON.stringify({
        ...profile,
        language: resolveLanguage(profile.language).name,
      }));
    }
  } catch {
    try {
      localStorage.removeItem(LANGUAGE_KEY);
    } catch { /* storage blocked */ }
  }
}

function readPreference() {
  try {
    sanitizeLanguageStorage();
    const saved = localStorage.getItem(LANGUAGE_KEY);
    if (saved && isKnownLanguage(saved)) {
      return resolveLanguage(saved).name;
    }
    return resolveLanguage(readJson(PROFILE_KEY).language).name;
  } catch { return 'English'; }
}

sanitizeLanguageStorage();
let currentLanguage = readPreference();
let revision = 0;
let hydratedForEmail = null;

export const getLanguageSnapshot = () => currentLanguage;
export const getLanguageRevision = () => revision;

/** Clear corrupt language keys and re-apply a safe language (Settings error recovery). */
export function sanitizeStoredLanguagePreferences() {
  sanitizeLanguageStorage();
  currentLanguage = readPreference();
  applyLanguage(currentLanguage);
  revision += 1;
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CHANGE_EVENT));
  return currentLanguage;
}

export function resetLanguageHydration() {
  hydratedForEmail = null;
}

export function setLanguage(value) {
  revision += 1;
  currentLanguage = resolveLanguage(value).name;
  try { localStorage.setItem(LANGUAGE_KEY, currentLanguage); } catch { /* Keep working when storage is blocked. */ }
  try {
    const profile = readJson(PROFILE_KEY);
    localStorage.setItem(PROFILE_KEY, JSON.stringify({ ...profile, language: currentLanguage }));
  } catch { /* A corrupt legacy profile must not block language changes. */ }
  applyLanguage(currentLanguage);
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CHANGE_EVENT));
  return { language: currentLanguage, revision };
}

export function shouldApplyRemoteLanguage(startedRevision) {
  return startedRevision === revision;
}

export async function persistUiLanguage(name, startedRevision) {
  const language = resolveLanguage(name).name;
  const { createStorageIdea } = await import('./storageIdeas.js');
  if (!shouldApplyRemoteLanguage(startedRevision)) return { skipped: true };
  await createStorageIdea('chat-settings', { uiLanguage: language });
  return { saved: language };
}

export async function restoreUiLanguageFromAccount() {
  const started = revision;
  const { fetchStorageIdea } = await import('./storageIdeas.js');
  const remote = await fetchStorageIdea('chat-settings');
  const remoteLanguage = remote?.uiLanguage;
  if (!remoteLanguage || !shouldApplyRemoteLanguage(started)) return null;
  if (resolveLanguage(remoteLanguage).name === currentLanguage) {
    return { language: currentLanguage, unchanged: true };
  }
  return setLanguage(remoteLanguage);
}

export async function hydrateUiLanguageFromAccount(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized || hydratedForEmail === normalized) return null;
  hydratedForEmail = normalized;
  try {
    return await restoreUiLanguageFromAccount();
  } catch {
    return null;
  }
}

export function subscribeLanguage(listener) {
  const onStorage = (event) => {
    if (event.key === LANGUAGE_KEY || event.key === PROFILE_KEY || event.key === null) {
      currentLanguage = readPreference();
      applyLanguage(currentLanguage);
      listener();
    }
  };
  if (typeof window !== 'undefined') {
    window.addEventListener(CHANGE_EVENT, listener);
    window.addEventListener('storage', onStorage);
  }
  return () => {
    if (typeof window !== 'undefined') {
      window.removeEventListener(CHANGE_EVENT, listener);
      window.removeEventListener('storage', onStorage);
    }
  };
}

if (typeof document !== 'undefined') {
  applyLanguage(currentLanguage);
}
