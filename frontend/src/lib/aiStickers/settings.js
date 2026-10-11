const STORAGE_KEY = 'allmodelai_ai_stickers_enabled';

export function readAiStickersEnabled(storage) {
  try {
    const store = storage === undefined ? globalThis.localStorage : storage;
    if (!store?.getItem) return true;
    const raw = store.getItem(STORAGE_KEY);
    if (raw === null) return true;
    return raw !== 'false';
  } catch {
    return true;
  }
}

export function writeAiStickersEnabled(enabled, storage = globalThis.localStorage) {
  try {
    storage?.setItem(STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {
    /* ignore */
  }
}

export { STORAGE_KEY as AI_STICKERS_ENABLED_KEY };
