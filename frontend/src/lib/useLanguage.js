import { useEffect, useSyncExternalStore } from 'react';
import { applyLanguage, translate } from './languages.js';
import { getLanguageSnapshot, resolveLanguage, setLanguage, subscribeLanguage } from './languagePreference.js';

export function useLanguage() {
  const name = useSyncExternalStore(subscribeLanguage, getLanguageSnapshot, () => 'English');
  const language = resolveLanguage(name);
  useEffect(() => { applyLanguage(name); }, [name]);
  return { language, setLanguage, t: (key, values) => translate(key, language.code, values) };
}
