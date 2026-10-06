import { resolveAuthApiUrl } from './authApi.js';
import { isCapacitorNative, nativeClientHeaders, usesRemoteApiOrigin } from './apiBase.js';
import { isMobileWebSafari } from './socialSignInEnv.js';
import { socialAuthDebug } from './socialAuthDiagnostics.js';
import { readJsonBody } from './httpJson.js';

const SESSION_CLEARED_EVENT = 'allmodelai:session-cleared';
export const SESSION_UPDATED_EVENT = 'allmodelai:session-updated';

let verifiedSession = null;
let pendingSession = null;
let sessionGeneration = 0;
let logoutInProgress = false;
/** Client-side hint only; server HttpOnly cookie is the source of truth. */
const cacheDuration = 30 * 60 * 1000;
export {
  applyAuthResponsePayload,
  clearNativeSessionToken,
  getNativeSessionToken,
  nativeSessionHeaders,
  storeNativeSessionToken,
} from './nativeSession.js';
import { clearNativeSessionToken, getNativeSessionToken, nativeSessionHeaders } from './nativeSession.js';

/**
 * Returns an object representing the storage to use for the session.
 * Prefers localStorage, but falls back to sessionStorage if localStorage is unavailable.
 * All operations sync both storages to keep legacy code working.
 */
function getStorage() {
  // Safari may throw while accessing the storage property itself.
  const access = (name) => {
    try { return globalThis[name] || null; } catch { return null; }
  };
  const local = access('localStorage');
  const session = access('sessionStorage');

  const primary = local || session;
  const fallback = primary === local ? session : local;

  function read(storage, key) {
    if (!storage) return null;

    try {
      return storage.getItem(key);
    } catch {
      return null;
    }
  }

  function write(storage, key, value) {
    if (!storage) return;

    try {
      storage.setItem(key, value);
    } catch {
      return;
    }
  }

  function remove(storage, key) {
    if (!storage) return;

    try {
      storage.removeItem(key);
    } catch {
      return;
    }
  }

  return {
    getItem(key) {
      const val = read(primary, key);

      if (val !== null) {
        return val;
      }

      return read(fallback, key);
    },

    setItem(key, value) {
      write(primary, key, value);
      write(fallback, key, value);
    },

    removeItem(key) {
      remove(primary, key);
      remove(fallback, key);
    },
  };
}

function dispatchSessionUpdated(user) {
  if (typeof globalThis.dispatchEvent !== 'function') return;
  globalThis.dispatchEvent(new CustomEvent(SESSION_UPDATED_EVENT, { detail: { user } }));
}

/** Client-side session hint (server HttpOnly cookie remains source of truth). */
export function readStoredSessionUser() {
  const saved = getStorage().getItem('allmodelai_user');
  if (!saved) return null;
  try {
    const parsed = JSON.parse(saved);
    return parsed?.email ? parsed : null;
  } catch {
    return null;
  }
}

export function rememberSession(user) {
  if (!user?.email) throw new Error('Missing session user');
  const saved = JSON.stringify(user);
  const storage = getStorage();
  storage.setItem('allmodelai_user', saved);
  verifiedSession = { user, saved: storage.getItem('allmodelai_user'), expiresAt: Date.now() + cacheDuration };
  dispatchSessionUpdated(user);
  return user;
}

async function fetchSessionFromServer() {
  const response = await fetch(resolveAuthApiUrl('session'), {
    credentials: 'include',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      ...nativeClientHeaders(),
      ...nativeSessionHeaders(),
    },
  });
  const { data, parseError } = await readJsonBody(response);
  if (parseError) throw parseError;
  return { response, data };
}

function sessionRestoreHintFromStorage(savedRaw) {
  if (!savedRaw) return null;
  try {
    const parsed = JSON.parse(savedRaw);
    return parsed?.email ? parsed : null;
  } catch {
    return null;
  }
}

export async function restoreSession({ force = false } = {}) {
  const storage = getStorage();
  const saved = storage.getItem('allmodelai_user');
  if (!force && verifiedSession?.saved === saved && verifiedSession.expiresAt > Date.now()) {
    return verifiedSession.user;
  }
  if (pendingSession?.generation === sessionGeneration) {
    if (!force) return pendingSession.promise;
    sessionGeneration += 1;
  }
  const generation = sessionGeneration;
  const request = { generation };
  request.promise = (async () => {
    const storedHint = sessionRestoreHintFromStorage(saved);
    const retryDelays = storedHint && (isMobileWebSafari() || getNativeSessionToken()) ? [0, 120, 320] : [0];

    for (let attempt = 0; attempt < retryDelays.length; attempt += 1) {
      if (retryDelays[attempt] > 0) {
        await new Promise((resolve) => setTimeout(resolve, retryDelays[attempt]));
      }
      if (generation !== sessionGeneration) throw new Error('Session changed. Please try again.');

      const { response, data } = await fetchSessionFromServer();
      if (generation !== sessionGeneration) throw new Error('Session changed. Please try again.');

      if (response.ok) {
        socialAuthDebug('SESSION_RESTORED', { source: 'api', attempt });
        return rememberSession(data.user);
      }
      if (response.status !== 401) {
        throw new Error(data?.message || 'Could not verify your session. Please try again.');
      }
    }

    if (storedHint && (getNativeSessionToken() || isMobileWebSafari() || usesRemoteApiOrigin())) {
      socialAuthDebug('SESSION_RESTORED', { source: 'client-hint', email: storedHint.email });
      return rememberSession(storedHint);
    }

    verifiedSession = null;
    storage.removeItem('allmodelai_user');
    return null;
  })();
  pendingSession = request;
  try {
    return await request.promise;
  } finally {
    if (pendingSession === request) pendingSession = null;
  }
}

// Verify that the browser accepted the HttpOnly cookie before opening the app.
export async function confirmSession(user) {
  if (!user?.email) {
    throw new Error('Your sign-in could not be verified. Please retry.');
  }
  rememberSession(user);

  const matchesUser = (candidate) =>
    candidate?.email?.toLowerCase() === user.email.toLowerCase();

  try {
    const verified = await restoreSession({ force: true });
    if (matchesUser(verified)) {
      socialAuthDebug('SESSION_CONFIRMED', { source: 'restoreSession' });
      return verified;
    }
  } catch {
    /* Cookie may not be ready yet on cross-origin or native clients. */
  }

  const lenientSessionConfirm =
    isCapacitorNative()
    || usesRemoteApiOrigin()
    || Boolean(getNativeSessionToken())
    || isMobileWebSafari();

  if (lenientSessionConfirm) {
    const retryDelays = isMobileWebSafari() ? [0, 120, 320] : [0];
    for (const delayMs of retryDelays) {
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
      try {
        const retry = await restoreSession({ force: true });
        if (matchesUser(retry)) {
          socialAuthDebug('SESSION_CONFIRMED', { source: 'restoreSession-retry' });
          return retry;
        }
      } catch {
        /* retry */
      }
    }
    if (getNativeSessionToken() || isMobileWebSafari()) {
      socialAuthDebug('SESSION_CONFIRMED', { source: 'native-or-mobile-trusted' });
      return rememberSession(user);
    }
    socialAuthDebug('SESSION_CONFIRMED', { source: 'trusted-login-payload' });
    return rememberSession(user);
  }

  clearAllSessionData();
  throw new Error('Your sign-in could not be verified. Please retry.');
}

/**
 * Clears session data from both localStorage and sessionStorage.
 */
export function isLogoutInProgress() {
  return logoutInProgress;
}

export function subscribeSessionCleared(onCleared) {
  if (typeof globalThis.addEventListener !== 'function') {
    return () => {};
  }
  const handler = () => onCleared();
  globalThis.addEventListener(SESSION_CLEARED_EVENT, handler);
  return () => globalThis.removeEventListener(SESSION_CLEARED_EVENT, handler);
}

function dispatchSessionCleared() {
  if (typeof globalThis.dispatchEvent === 'function') {
    globalThis.dispatchEvent(new Event(SESSION_CLEARED_EVENT));
  }
}

export function clearAllSessionData() {
  sessionGeneration += 1;
  verifiedSession = null;
  pendingSession = null;
  const storage = getStorage();
  storage.removeItem('allmodelai_user');
  clearNativeSessionToken();
  dispatchSessionCleared();
}

/**
 * Invalidates the HttpOnly session on the server, then clears client session hints.
 * Treats missing/expired sessions as a successful sign-out.
 */
export async function performLogout() {
  if (logoutInProgress) {
    return { ok: true, skipped: true };
  }
  logoutInProgress = true;
  try {
    const response = await fetch(resolveAuthApiUrl('logout'), {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        ...nativeClientHeaders(),
        ...nativeSessionHeaders(),
      },
    });
    if (!response.ok && response.status !== 401 && response.status !== 404) {
      throw new Error('Could not sign out. Try again.');
    }
    clearAllSessionData();
    return { ok: true };
  } catch (error) {
    logoutInProgress = false;
    throw error;
  } finally {
    logoutInProgress = false;
  }
}
