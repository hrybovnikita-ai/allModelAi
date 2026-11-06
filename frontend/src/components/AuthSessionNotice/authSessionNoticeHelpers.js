const STORAGE_KEY = 'allmodelai_auth_notice';

export function clearAuthSessionNotice() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* private mode */
  }
  if (typeof globalThis.dispatchEvent === 'function') {
    globalThis.dispatchEvent(new CustomEvent('allmodelai:auth-notice-cleared'));
  }
}

export { STORAGE_KEY as AUTH_SESSION_NOTICE_STORAGE_KEY };
