import { LANGUAGES, applyLanguage } from './languages.js';

export const LANGUAGE_KEY = 'allmodelai_language';
export const PROFILE_KEY = 'allmodelai_profile';
const CHANGE_EVENT = 'allmodelai-language-change';
export const resolveLanguage = (value) =>
  LANGUAGES.find((language) => language.name === value || language.code === value) || LANGUAGES[0];

function readPreference() {
  try {
    const saved = localStorage.getItem(LANGUAGE_KEY);
    if (saved) return resolveLanguage(saved).name;
    return resolveLanguage(JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}')?.language).name;
  } catch { return 'English'; }
}
let currentLanguage = readPreference();
export const getLanguageSnapshot = () => currentLanguage;

export function setLanguage(value) {
  currentLanguage = resolveLanguage(value).name;
  try { localStorage.setItem(LANGUAGE_KEY, currentLanguage); } catch { /* Keep working when storage is blocked. */ }
  try {
    const profile = JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}') || {};
    localStorage.setItem(PROFILE_KEY, JSON.stringify({ ...profile, language: currentLanguage }));
  } catch { /* A corrupt legacy profile must not block language changes. */ }
  applyLanguage(currentLanguage);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}
export function subscribeLanguage(listener) {
  const onStorage = (event) => {
    if (event.key === LANGUAGE_KEY || event.key === PROFILE_KEY || event.key === null) {
      currentLanguage = readPreference();
      applyLanguage(currentLanguage);
      listener();
    }
  };
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener('storage', onStorage);
  };
}
