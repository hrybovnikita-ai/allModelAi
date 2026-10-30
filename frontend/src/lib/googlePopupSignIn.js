import { onAuthStateChanged } from 'firebase/auth';
import { authLog, socialAuthDebug } from './socialAuthDiagnostics.js';

/** Max wait for Google popup + Firebase to return a signed-in user (ms). */
export const GOOGLE_POPUP_SIGNIN_TIMEOUT_MS = 120_000;

/** How recent lastSignInTime must be when recovering via auth state (ms). */
export const GOOGLE_POPUP_RECENT_SIGNIN_MS = 120_000;

let popupSignInBaselineUid = null;
let popupSignInStartedAt = 0;

export function markGooglePopupSignInBaseline(auth) {
  popupSignInBaselineUid = auth?.currentUser?.uid || null;
  popupSignInStartedAt = Date.now();
}

export function resetGooglePopupSignInBaselineForTests() {
  popupSignInBaselineUid = null;
  popupSignInStartedAt = 0;
}

export function isFreshGoogleSignInUser(user, baselineUid, startedAt) {
  if (!user?.email) return false;
  if (baselineUid && user.uid === baselineUid) return false;
  const lastSignIn = Date.parse(user.metadata?.lastSignInTime || '');
  if (!Number.isFinite(lastSignIn)) {
    return startedAt > 0 && Date.now() - startedAt < GOOGLE_POPUP_RECENT_SIGNIN_MS;
  }
  return lastSignIn >= (startedAt || 0) - 5000
    && lastSignIn <= Date.now() + 30000
    && Date.now() - lastSignIn <= GOOGLE_POPUP_RECENT_SIGNIN_MS;
}

export function waitForFreshAuthUser(auth, baselineUid, startedAt, timeoutMs, signal) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer;
    let unsubscribe = () => {};
    const finish = (handler) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe();
      signal?.removeEventListener('abort', abort);
      handler();
    };
    const abort = () => finish(() => reject(Object.assign(new Error('Sign-in wait cancelled.'), { code: 'auth/cancelled-popup-request' })));

    const consider = (user, source) => {
      if (!isFreshGoogleSignInUser(user, baselineUid, startedAt)) return;
      socialAuthDebug('GOOGLE_POPUP_AUTH_STATE_RECOVERED', { source });
      authLog('Recovered Google sign-in from auth state', { source });
      finish(() => resolve({ user }));
    };

    if (auth.currentUser) {
      consider(auth.currentUser, 'currentUser-immediate');
    }
    if (settled) return;
    if (signal?.aborted) return abort();
    signal?.addEventListener('abort', abort, { once: true });

    unsubscribe = onAuthStateChanged(auth, (user) => {
      consider(user, 'onAuthStateChanged');
    });
    if (settled) { unsubscribe(); return; }

    timer = setTimeout(() => {
      finish(() => {
        reject(Object.assign(new Error('Google sign-in timed out. Please try again.'), {
          code: 'auth/popup-timeout',
        }));
      });
    }, timeoutMs);
  });
}

/**
 * Resolve signInWithPopup when the popup promise stalls (cross-origin authDomain / COOP).
 */
export async function awaitGooglePopupSignInResult(auth, popupPromise, options = {}) {
  const timeoutMs = options.timeoutMs ?? GOOGLE_POPUP_SIGNIN_TIMEOUT_MS;
  const baselineUid = popupSignInBaselineUid;
  const startedAt = popupSignInStartedAt || Date.now();

  const popupPath = popupPromise.then(
    (result) => ({ kind: 'popup', result }),
    (error) => ({ kind: 'popupError', error }),
  );
  popupPath.catch(() => {});

  const controller = new AbortController();
  const authStatePath = waitForFreshAuthUser(auth, baselineUid, startedAt, timeoutMs, controller.signal).then(
    (result) => ({ kind: 'authState', result }),
    (error) => ({ kind: 'authStateError', error }),
  );
  authStatePath.catch(() => {});

  const winner = await Promise.race([popupPath, authStatePath]);
  controller.abort();

  if (winner.kind === 'popup') {
    socialAuthDebug('GOOGLE_POPUP_PROMISE_RESOLVED', { hasUser: Boolean(winner.result?.user?.email) });
    return winner.result;
  }

  if (winner.kind === 'authState') {
    return winner.result;
  }

  if (winner.kind === 'popupError') {
    const popupError = winner.error;
    if (popupError?.code === 'auth/popup-closed-by-user' || popupError?.code === 'auth/cancelled-popup-request') {
      throw popupError;
    }
    socialAuthDebug('GOOGLE_POPUP_PROMISE_REJECTED', { code: popupError?.code });
    try {
      return await waitForFreshAuthUser(auth, baselineUid, startedAt, 4000);
    } catch {
      if (popupError?.code === 'auth/internal-error' && auth.currentUser?.email
        && isFreshGoogleSignInUser(auth.currentUser, baselineUid, startedAt)) {
        socialAuthDebug('GOOGLE_POPUP_COOP_RECOVERED', { code: popupError.code });
        return { user: auth.currentUser };
      }
      throw popupError;
    }
  }

  throw winner.error || Object.assign(new Error('Google sign-in timed out. Please try again.'), {
    code: 'auth/popup-timeout',
  });
}
