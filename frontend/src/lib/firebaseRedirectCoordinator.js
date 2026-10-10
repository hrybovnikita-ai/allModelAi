import { getRedirectResult, onAuthStateChanged } from 'firebase/auth';
import { authRecoveryLog, socialAuthDebug } from './socialAuthDiagnostics.js';
import { isMobileWebSafari } from './socialSignInEnv.js';

let cachedRedirectResult = undefined;
let redirectResultInflight = null;
let redirectResultConsumed = false;

/** Max wait for getRedirectResult on a normal page load (ms). */
export const REDIRECT_RESULT_TIMEOUT_MS = 800;
/** Max wait for onAuthStateChanged fallback after redirect (ms). */
export const AUTH_STATE_FALLBACK_TIMEOUT_MS = 1000;
/** WebKit often resolves getRedirectResult after several seconds on iPad/iPhone Safari. */
export const IOS_REDIRECT_RESULT_TIMEOUT_MS = 12000;
export const IOS_AUTH_STATE_FALLBACK_TIMEOUT_MS = 8000;
/** After a timeout race, still accept a late getRedirectResult on iOS (ms). */
export const IOS_LATE_REDIRECT_GRACE_MS = 4000;

export function resetFirebaseRedirectCoordinatorForTests() {
  cachedRedirectResult = undefined;
  redirectResultInflight = null;
  redirectResultConsumed = false;
}

export function hasRedirectResultBeenConsumed() {
  return redirectResultConsumed;
}

function isIosWebContext() {
  return isMobileWebSafari() || (typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent));
}

function getRedirectResultTimeoutMs() {
  return isIosWebContext() ? IOS_REDIRECT_RESULT_TIMEOUT_MS : REDIRECT_RESULT_TIMEOUT_MS;
}

function getAuthStateFallbackTimeoutMs() {
  return isIosWebContext() ? IOS_AUTH_STATE_FALLBACK_TIMEOUT_MS : AUTH_STATE_FALLBACK_TIMEOUT_MS;
}

function waitForAuthStateUser(auth, timeoutMs = getAuthStateFallbackTimeoutMs()) {
  if (auth.currentUser) {
    socialAuthDebug('FIREBASE_AUTH_STATE_RESTORED', { source: 'currentUser' });
    authRecoveryLog('Auth state already has currentUser');
    return Promise.resolve(auth.currentUser);
  }

  authRecoveryLog('Waiting for onAuthStateChanged fallback', { timeoutMs });

  return new Promise((resolve) => {
    let settled = false;
    const finish = (user, source) => {
      if (settled) return;
      settled = true;
      unsubscribe();
      clearTimeout(timer);
      if (user) {
        socialAuthDebug('FIREBASE_AUTH_STATE_RESTORED', { source });
        socialAuthDebug('AUTH_STATE_USER_FOUND', { source });
        authRecoveryLog('Auth state user found', { source });
      } else {
        authRecoveryLog('Auth state fallback finished without user', { source });
      }
      resolve(user || null);
    };

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) finish(user, 'onAuthStateChanged');
    });

    const timer = setTimeout(() => finish(auth.currentUser, 'timeout'), timeoutMs);
  });
}

/**
 * WebKit may settle getRedirectResult late; on iOS keep waiting for the same promise after a soft timeout.
 */
async function settleGetRedirectResult(auth) {
  const timeoutMs = getRedirectResultTimeoutMs();
  authRecoveryLog('Checking getRedirectResult...', { timeoutMs });

  let timedOut = false;

  const timeoutPromise = new Promise((resolve) => {
    setTimeout(() => {
      timedOut = true;
      socialAuthDebug('GET_REDIRECT_RESULT_TIMEOUT', { timeoutMs });
      authRecoveryLog('Timeout triggered', { timeoutMs });
      if (auth.currentUser) {
        resolve({ user: auth.currentUser, source: 'currentUser-on-timeout' });
        return;
      }
      resolve(null);
    }, timeoutMs);
  });

  const redirectPromise = getRedirectResult(auth)
    .then((result) => {
      if (!timedOut) {
        authRecoveryLog('Result resolved', { hasUser: Boolean(result?.user) });
      }
      return result;
    })
    .catch((error) => {
      if (timedOut) {
        authRecoveryLog('getRedirectResult rejected after timeout (ignored)', { code: error?.code });
        return null;
      }
      throw error;
    });

  const raced = await Promise.race([redirectPromise, timeoutPromise]);
  if (raced?.user) {
    return raced;
  }

  if (isIosWebContext()) {
    const late = await Promise.race([
      redirectPromise,
      new Promise((resolve) => setTimeout(() => resolve(null), IOS_LATE_REDIRECT_GRACE_MS)),
    ]);
    if (late?.user) {
      socialAuthDebug('GET_REDIRECT_RESULT_SUCCESS', { source: 'ios-late-redirect' });
      return late;
    }
    if (auth.currentUser) {
      return { user: auth.currentUser, source: 'currentUser-after-late-wait' };
    }
  }

  return null;
}

async function resolveRedirectUser(auth, allowAuthStateFallback) {
  let result = await settleGetRedirectResult(auth);
  if (result?.user) {
    return result;
  }
  if (!allowAuthStateFallback) {
    return null;
  }
  const user = await waitForAuthStateUser(auth);
  if (!user) {
    return null;
  }
  return { user, source: 'authStateFallback' };
}

/**
 * Exactly one getRedirectResult() per page load. Subsequent callers reuse the resolved user.
 * Call ensureSocialAuthReady() (persistence) before this on redirect return.
 */
export async function consumeFirebaseRedirectResult(auth, consumer, { allowAuthStateFallback = false } = {}) {
  socialAuthDebug('GET_REDIRECT_RESULT_BEGIN', { consumer });
  authRecoveryLog('consumeFirebaseRedirectResult begin', { consumer });

  if (cachedRedirectResult !== undefined) {
    if (cachedRedirectResult?.user) {
      socialAuthDebug('GET_REDIRECT_RESULT_SUCCESS', { consumer, source: 'cache' });
      socialAuthDebug('FIREBASE_REDIRECT_RESULT', { ok: true, source: 'cache' });
      return cachedRedirectResult;
    }
    socialAuthDebug('GET_REDIRECT_RESULT_NULL', { consumer, source: 'cache' });
    socialAuthDebug('FIREBASE_REDIRECT_RESULT', { ok: false, source: 'cache' });
    return null;
  }

  if (!redirectResultInflight) {
    redirectResultInflight = (async () => {
      try {
        const result = await resolveRedirectUser(auth, allowAuthStateFallback);
        redirectResultConsumed = true;
        if (result?.user) {
          cachedRedirectResult = result;
          socialAuthDebug('GET_REDIRECT_RESULT_SUCCESS', {
            consumer,
            source: result.source || 'getRedirectResult',
          });
          socialAuthDebug('FIREBASE_REDIRECT_RESULT', { ok: true, source: result.source || 'getRedirectResult' });
          return result;
        }
        cachedRedirectResult = null;
        socialAuthDebug('GET_REDIRECT_RESULT_NULL', { consumer, source: 'exhausted' });
        socialAuthDebug('FIREBASE_REDIRECT_RESULT', { ok: false, source: 'exhausted' });
        return null;
      } catch (error) {
        cachedRedirectResult = null;
        redirectResultConsumed = true;
        socialAuthDebug('GET_REDIRECT_RESULT_NULL', { consumer, code: error?.code, message: error?.message });
        socialAuthDebug('FIREBASE_REDIRECT_RESULT', { ok: false, code: error?.code });
        authRecoveryLog('getRedirectResult error', { code: error?.code });
        throw error;
      } finally {
        redirectResultInflight = null;
      }
    })();
  }

  return redirectResultInflight;
}
