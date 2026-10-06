import { getRedirectResult, onAuthStateChanged } from 'firebase/auth';
import { socialAuthDebug } from './socialAuthDiagnostics.js';
import { isMobileWebSafari } from './socialSignInEnv.js';

let cachedRedirectResult = undefined;
let redirectResultInflight = null;
let redirectResultConsumed = false;

export function resetFirebaseRedirectCoordinatorForTests() {
  cachedRedirectResult = undefined;
  redirectResultInflight = null;
  redirectResultConsumed = false;
}

export function hasRedirectResultBeenConsumed() {
  return redirectResultConsumed;
}

function waitForAuthStateUser(auth, timeoutMs = isMobileWebSafari() ? 12000 : 5000) {
  if (auth.currentUser) {
    socialAuthDebug('FIREBASE_AUTH_STATE_RESTORED', { source: 'currentUser' });
    return Promise.resolve(auth.currentUser);
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (user, source) => {
      if (settled) return;
      settled = true;
      unsubscribe();
      clearTimeout(timer);
      if (user) {
        socialAuthDebug('FIREBASE_AUTH_STATE_RESTORED', { source });
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
 * Exactly one getRedirectResult() per page load. Subsequent callers reuse cache or auth-state fallback.
 */
export async function consumeFirebaseRedirectResult(auth, consumer, { allowAuthStateFallback = false } = {}) {
  socialAuthDebug('GET_REDIRECT_RESULT_BEGIN', { consumer });

  if (cachedRedirectResult !== undefined) {
    if (cachedRedirectResult?.user) {
      socialAuthDebug('GET_REDIRECT_RESULT_SUCCESS', { consumer, source: 'cache' });
      socialAuthDebug('FIREBASE_REDIRECT_RESULT', { ok: true, source: 'cache' });
      return cachedRedirectResult;
    }
    if (!allowAuthStateFallback) {
      socialAuthDebug('GET_REDIRECT_RESULT_NULL', { consumer, source: 'cache' });
      socialAuthDebug('FIREBASE_REDIRECT_RESULT', { ok: false, source: 'cache' });
      return null;
    }
    const user = await waitForAuthStateUser(auth);
    return user ? { user } : null;
  }

  if (!redirectResultInflight) {
    redirectResultInflight = (async () => {
      try {
        const result = await getRedirectResult(auth);
        redirectResultConsumed = true;
        if (result?.user) {
          cachedRedirectResult = result;
          socialAuthDebug('GET_REDIRECT_RESULT_SUCCESS', { consumer, source: 'getRedirectResult' });
          socialAuthDebug('FIREBASE_REDIRECT_RESULT', { ok: true, source: 'getRedirectResult' });
          return result;
        }
        cachedRedirectResult = null;
        socialAuthDebug('GET_REDIRECT_RESULT_NULL', { consumer, source: 'getRedirectResult' });
        socialAuthDebug('FIREBASE_REDIRECT_RESULT', { ok: false, source: 'getRedirectResult' });
        return null;
      } catch (error) {
        cachedRedirectResult = null;
        redirectResultConsumed = true;
        socialAuthDebug('GET_REDIRECT_RESULT_NULL', { consumer, code: error?.code, message: error?.message });
        socialAuthDebug('FIREBASE_REDIRECT_RESULT', { ok: false, code: error?.code });
        throw error;
      } finally {
        redirectResultInflight = null;
      }
    })();
  }

  const result = await redirectResultInflight;
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
  socialAuthDebug('FIREBASE_USER_RESTORED', { consumer, source: 'authStateFallback' });
  return { user };
}
