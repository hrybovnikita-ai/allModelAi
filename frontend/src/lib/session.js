import { resolveAuthApiUrl } from './authApi.js';
import { isCapacitorNative, nativeClientHeaders, usesRemoteApiOrigin } from './apiBase.js';
import { socialAuthDebug } from './socialAuthDiagnostics.js';
import { readJsonBody } from './httpJson.js';
import { clearFirebaseIdTokenFallback, firebaseSessionFallbackHeaders } from './firebaseSessionFallback.js';
import { readCookieConsent, waitForCookieConsentChoice } from './cookieConsent.js';

const SESSION_CLEARED_EVENT = 'allmodelai:session-cleared';
export const SESSION_UPDATED_EVENT = 'allmodelai:session-updated';
const FRESH_LOGIN_KEY = 'allmodelai_fresh_login';
const FRESH_LOGIN_GRACE_MS = 120000;

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

export function markFreshLogin() {
  try {
    getStorage().setItem(FRESH_LOGIN_KEY, String(Date.now()));
  } catch {
    /* Safari private mode */
  }
}

export function clearFreshLoginMark() {
  try {
    getStorage().removeItem(FRESH_LOGIN_KEY);
  } catch {
    /* ignore */
  }
}

export function isFreshLoginGraceActive(maxMs = FRESH_LOGIN_GRACE_MS) {
  try {
    const raw = getStorage().getItem(FRESH_LOGIN_KEY);
    if (!raw) return false;
    const started = Number(raw);
    if (!Number.isFinite(started)) return false;
    return Date.now() - started < maxMs;
  } catch {
    return false;
  }
}

function hasFirebaseSessionFallback() {
  return Boolean(firebaseSessionFallbackHeaders().Authorization);
}

/** True when the client should ask the server to confirm session (cookie is not readable in JS). */
export function hasSessionRestoreHint() {
  if (getNativeSessionToken()) return true;
  if (hasFirebaseSessionFallback()) return true;
  if (isFreshLoginGraceActive()) return true;
  if (readStoredSessionUser()) return true;
  return false;
}

function sessionRestoreRetryDelays() {
  if (isFreshLoginGraceActive() || hasFirebaseSessionFallback()) {
    return [0, 200, 500];
  }
  if (getNativeSessionToken()) {
    return [0, 150];
  }
  return [0];
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
  void import('./clientAuthReset.js').then(({ resetUnauthorizedRedirectGuard }) => {
    resetUnauthorizedRedirectGuard();
  }).catch(() => {});
  dispatchSessionUpdated(user);
  return user;
}

/**
 * Single GET /api/auth/session call (credentials + native/Firebase headers).
 * Prefer {@link restoreSession} for app bootstrap; use this for a raw probe or tests.
 */
export async function fetchSessionFromServer() {
  if (typeof document !== 'undefined' && !readCookieConsent()) {
    await waitForCookieConsentChoice(1500);
  }
  const response = await fetch(resolveAuthApiUrl('session'), {
    credentials: 'include',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      ...nativeClientHeaders(),
      ...nativeSessionHeaders(),
      ...firebaseSessionFallbackHeaders(),
    },
  });
  const { data, parseError } = await readJsonBody(response);
  if (parseError) throw parseError;
  return { response, data };
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
    if (!force && !hasSessionRestoreHint()) {
      socialAuthDebug('SESSION_RESTORE_SKIPPED', { reason: 'no-restore-hint' });
      verifiedSession = null;
      return null;
    }

    const retryDelays = sessionRestoreRetryDelays();

    for (let attempt = 0; attempt < retryDelays.length; attempt += 1) {
      if (retryDelays[attempt] > 0) {
        await new Promise((resolve) => setTimeout(resolve, retryDelays[attempt]));
      }
      if (generation !== sessionGeneration) throw new Error('Session changed. Please try again.');

      let response;
      let data;
      try {
        ({ response, data } = await fetchSessionFromServer());
      } catch (networkError) {
        if (attempt === retryDelays.length - 1) throw networkError;
        continue;
      }
      if (generation !== sessionGeneration) throw new Error('Session changed. Please try again.');

      if (response.ok) {
        if (!data?.user?.email) {
          socialAuthDebug('SESSION_GUEST', { pathname: '/api/auth/session', attempt });
          verifiedSession = null;
          if (!isFreshLoginGraceActive()) {
            storage.removeItem('allmodelai_user');
          }
          if (attempt < retryDelays.length - 1) continue;
          return null;
        }
        socialAuthDebug('SESSION_RESTORED', { source: 'api', attempt });
        clearFreshLoginMark();
        clearFirebaseIdTokenFallback();
        return rememberSession(data.user);
      }
      if (response.status === 401) {
        socialAuthDebug('SESSION_CONFIRM_401', { pathname: '/api/auth/session', attempt });
        if (attempt < retryDelays.length - 1) continue;
        break;
      }
      throw new Error(data?.message || 'Could not verify your session. Please try again.');
    }

    verifiedSession = null;
    if (!isFreshLoginGraceActive()) {
      storage.removeItem('allmodelai_user');
    }
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
  markFreshLogin();
  rememberSession(user);

  const matchesUser = (candidate) =>
    candidate?.email?.toLowerCase() === user.email.toLowerCase();

  try {
    const verified = await restoreSession({ force: true });
    if (matchesUser(verified)) {
      socialAuthDebug('SESSION_CONFIRM_OK', { email: verified.email, source: 'restoreSession' });
      socialAuthDebug('SESSION_CONFIRMED', { source: 'restoreSession' });
      return verified;
    }
    socialAuthDebug('SESSION_CONFIRM_401', { pathname: '/api/auth/session', phase: 'initial' });
  } catch {
    socialAuthDebug('SESSION_CONFIRM_401', { pathname: '/api/auth/session', phase: 'error' });
    /* Cookie may not be ready yet on cross-origin or native clients. */
  }

  const lenientSessionConfirm =
    isCapacitorNative()
    || usesRemoteApiOrigin()
    || Boolean(getNativeSessionToken());

  if (lenientSessionConfirm) {
    const retryDelays = [0, 200, 500];
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
    if (getNativeSessionToken()) {
      socialAuthDebug('SESSION_CONFIRMED', { source: 'native-session-header' });
      return rememberSession(user);
    }
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
  clearFirebaseIdTokenFallback();
  clearFreshLoginMark();
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
  let serverOk = false;
  let warning = null;
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
    if (response.ok || response.status === 401 || response.status === 404) {
      serverOk = true;
    } else {
      warning = 'Could not confirm sign-out on the server. You were signed out on this device.';
    }
  } catch {
    warning = 'Could not reach the server. You were signed out on this device.';
  } finally {
    const { purgeClientAuthState } = await import('./clientAuthReset.js');
    await purgeClientAuthState();
    logoutInProgress = false;
  }
  return { ok: true, serverOk, warning };
}
