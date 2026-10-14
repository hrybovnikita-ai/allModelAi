import { onAuthStateChanged } from 'firebase/auth';
import { ensureSocialAuthReady, isFirebaseSocialConfigured } from './firebase.js';
import { stashFirebaseIdToken } from './firebaseSessionFallback.js';
import { readStoredSessionUser, SESSION_UPDATED_EVENT } from './session.js';
import { socialAuthDebug } from './socialAuthDiagnostics.js';

let stopSync = null;

/**
 * Keeps Firebase ID token in sync for backend Bearer fallback and warms auth before redirect recovery.
 */
export function startFirebaseAuthSessionSync() {
  if (typeof window === 'undefined' || stopSync) {
    return stopSync || (() => {});
  }
  if (!isFirebaseSocialConfigured()) {
    return () => {};
  }

  let unsubscribe = null;
  void ensureSocialAuthReady()
    .then((auth) => {
      socialAuthDebug('FIREBASE_AUTH_STATE_LISTENER_START', {});
      unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
        void (async () => {
          if (!firebaseUser?.email) return;
          try {
            const token = await firebaseUser.getIdToken(false);
            stashFirebaseIdToken(token);
          } catch {
            /* token refresh optional during bootstrap */
          }
          const cached = readStoredSessionUser();
          if (
            cached?.email
            && cached.email.toLowerCase() === String(firebaseUser.email).toLowerCase()
          ) {
            globalThis.dispatchEvent(new CustomEvent(SESSION_UPDATED_EVENT, { detail: { user: cached } }));
          }
        })();
      });
    })
    .catch(() => {});

  stopSync = () => {
    unsubscribe?.();
    unsubscribe = null;
    stopSync = null;
  };
  return stopSync;
}

export function resetFirebaseAuthSessionSyncForTests() {
  stopSync?.();
  stopSync = null;
}
