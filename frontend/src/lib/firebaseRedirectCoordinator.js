import { getRedirectResult, onAuthStateChanged } from 'firebase/auth';
import { ensureRedirectPrerequisitesReady } from './authRedirectPreload.js';
import { authRecoveryLog, socialAuthDebug } from './socialAuthDiagnostics.js';
import { isGoogleRedirectRecoveryPending } from './socialRedirectState.js';
import { isMobileWebSafari } from './socialSignInEnv.js';

let cachedRedirectResult = undefined;
let redirectResultInflight = null;
let redirectResultConsumed = false;
let redirectResultAttemptCount = 0;

/** Max wait for getRedirectResult on a normal page load (ms). */
export const REDIRECT_RESULT_TIMEOUT_MS = 800;
/** Max wait for onAuthStateChanged fallback after redirect (ms). */
export const AUTH_STATE_FALLBACK_TIMEOUT_MS = 1000;
/** WebKit often resolves getRedirectResult slowly on iPad/iPhone Safari — wait for the full promise. */
export const IOS_REDIRECT_RESULT_TIMEOUT_MS = 28000;
export const IOS_AUTH_STATE_FALLBACK_TIMEOUT_MS = 10000;
/** After getRedirectResult returns empty on iOS, short grace for currentUser (ms). */
export const IOS_LATE_REDIRECT_GRACE_MS = 2000;

const MAX_REDIRECT_RESULT_ATTEMPTS = 2;

export function resetFirebaseRedirectCoordinatorForTests() {
  cachedRedirectResult = undefined;
  redirectResultInflight = null;
  redirectResultConsumed = false;
  redirectResultAttemptCount = 0;
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

function shouldAllowRedirectResultRetry() {
  return redirectResultAttemptCount < MAX_REDIRECT_RESULT_ATTEMPTS
    && isGoogleRedirectRecoveryPending();
}

function resetRedirectResultCacheForRetry() {
  cachedRedirectResult = undefined;
  redirectResultConsumed = false;
  redirectResultInflight = null;
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
        socialAuthDebug('FIREBASE_USER_UNAVAILABLE', { source: source || 'auth-state-timeout' });
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
 * On iOS, do not race getRedirectResult against an early null — wait for Firebase to finish.
 */
async function settleGetRedirectResultIos(auth) {
  const timeoutMs = getRedirectResultTimeoutMs();
  authRecoveryLog('iOS: awaiting getRedirectResult (full wait)', { timeoutMs });

  let redirectError = null;
  const redirectPromise = getRedirectResult(auth).catch((error) => {
    redirectError = error;
    socialAuthDebug('FIREBASE_OAUTH_CONFIG_ERROR', { code: error?.code, message: error?.message });
    throw error;
  });

  const timedResult = await Promise.race([
    redirectPromise,
    new Promise((resolve) => setTimeout(() => resolve('__timeout__'), timeoutMs)),
  ]);

  if (timedResult !== '__timeout__') {
    authRecoveryLog('iOS getRedirectResult settled', { hasUser: Boolean(timedResult?.user) });
    if (timedResult?.user) {
      return timedResult;
    }
  } else {
    socialAuthDebug('GET_REDIRECT_RESULT_TIMEOUT', { timeoutMs, platform: 'ios' });
    authRecoveryLog('iOS getRedirectResult timed out', { timeoutMs });
  }

  if (redirectError && timedResult === '__timeout__') {
    return null;
  }

  await new Promise((resolve) => setTimeout(resolve, IOS_LATE_REDIRECT_GRACE_MS));
  if (auth.currentUser) {
    return { user: auth.currentUser, source: 'currentUser-after-ios-wait' };
  }

  if (timedResult !== '__timeout__') {
    return timedResult?.user ? timedResult : null;
  }

  try {
    const late = await Promise.race([
      redirectPromise,
      new Promise((resolve) => setTimeout(() => resolve(null), IOS_LATE_REDIRECT_GRACE_MS)),
    ]);
    if (late?.user) {
      socialAuthDebug('GET_REDIRECT_RESULT_SUCCESS', { source: 'ios-late-redirect' });
      return late;
    }
  } catch {
    /* already logged */
  }

  return null;
}

async function settleGetRedirectResultDesktop(auth) {
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
      socialAuthDebug('FIREBASE_OAUTH_CONFIG_ERROR', { code: error?.code, message: error?.message });
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
  if (auth.currentUser) {
    return { user: auth.currentUser, source: 'currentUser-after-race' };
  }
  return null;
}

async function settleGetRedirectResult(auth) {
  if (isIosWebContext()) {
    return settleGetRedirectResultIos(auth);
  }
  return settleGetRedirectResultDesktop(auth);
}

async function resolveRedirectUser(auth, allowAuthStateFallback) {
  let result = await settleGetRedirectResult(auth);
  if (result?.user) {
    return result;
  }
  socialAuthDebug('FIREBASE_REDIRECT_RESULT_MISSING', { phase: 'getRedirectResult' });
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
 * Exactly one getRedirectResult() chain per attempt. Subsequent callers reuse a successful user.
 * Call ensureRedirectPrerequisitesReady() before this on OAuth return.
 */
export async function consumeFirebaseRedirectResult(auth, consumer, { allowAuthStateFallback = false } = {}) {
  socialAuthDebug('GET_REDIRECT_RESULT_BEGIN', { consumer, attempt: redirectResultAttemptCount + 1 });
  authRecoveryLog('consumeFirebaseRedirectResult begin', { consumer });

  if (cachedRedirectResult !== undefined) {
    if (cachedRedirectResult?.user) {
      socialAuthDebug('GET_REDIRECT_RESULT_SUCCESS', { consumer, source: 'cache' });
      socialAuthDebug('FIREBASE_REDIRECT_RESULT', { ok: true, source: 'cache' });
      return cachedRedirectResult;
    }
    if (shouldAllowRedirectResultRetry()) {
      socialAuthDebug('GET_REDIRECT_RESULT_RETRY', { consumer, attempt: redirectResultAttemptCount + 1 });
      resetRedirectResultCacheForRetry();
    } else {
      socialAuthDebug('GET_REDIRECT_RESULT_NULL', { consumer, source: 'cache' });
      socialAuthDebug('FIREBASE_REDIRECT_RESULT', { ok: false, source: 'cache' });
      return null;
    }
  }

  await ensureRedirectPrerequisitesReady();

  if (!redirectResultInflight) {
    redirectResultAttemptCount += 1;
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
        if (!shouldAllowRedirectResultRetry()) {
          cachedRedirectResult = null;
        }
        socialAuthDebug('GET_REDIRECT_RESULT_NULL', { consumer, source: 'exhausted' });
        socialAuthDebug('FIREBASE_REDIRECT_RESULT', { ok: false, source: 'exhausted' });
        return null;
      } catch (error) {
        if (!shouldAllowRedirectResultRetry()) {
          cachedRedirectResult = null;
        }
        redirectResultConsumed = true;
        socialAuthDebug('GET_REDIRECT_RESULT_NULL', { consumer, code: error?.code, message: error?.message });
        socialAuthDebug('FIREBASE_REDIRECT_RESULT', { ok: false, code: error?.code });
        socialAuthDebug('FIREBASE_OAUTH_CONFIG_ERROR', { code: error?.code, message: error?.message });
        authRecoveryLog('getRedirectResult error', { code: error?.code });
        throw error;
      } finally {
        redirectResultInflight = null;
      }
    })();
  }

  return redirectResultInflight;
}
