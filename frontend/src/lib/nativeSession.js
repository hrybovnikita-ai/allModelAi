const NATIVE_SESSION_KEY = 'allmodelai_native_session';

function readStorage(name) {
  try {
    return globalThis[name] || null;
  } catch {
    return null;
  }
}

function getStorage() {
  return readStorage('localStorage') || readStorage('sessionStorage');
}

export function storeNativeSessionToken(token) {
  if (!token || typeof token !== 'string') return;
  try {
    getStorage()?.setItem(NATIVE_SESSION_KEY, token);
  } catch {
    /* Storage may be blocked on some mobile browsers. */
  }
}

export function getNativeSessionToken() {
  try {
    return getStorage()?.getItem(NATIVE_SESSION_KEY) || null;
  } catch {
    return null;
  }
}

export function clearNativeSessionToken() {
  try {
    getStorage()?.removeItem(NATIVE_SESSION_KEY);
  } catch {
    /* Storage may be blocked on some mobile browsers. */
  }
}

export function nativeSessionHeaders() {
  const token = getNativeSessionToken();
  return token ? { 'X-AllModelAI-Session': token } : {};
}

export function applyAuthResponsePayload(data) {
  if (data?.nativeSessionToken) storeNativeSessionToken(data.nativeSessionToken);
}
