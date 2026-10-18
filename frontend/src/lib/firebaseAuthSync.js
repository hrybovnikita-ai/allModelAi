import { onAuthStateChanged } from 'firebase/auth';
import { ensureSocialAuthReady, isFirebaseSocialConfigured } from './firebase.js';
import { stashFirebaseIdToken } from './firebaseSessionFallback.js';
import { isLogoutInProgress } from './session.js';
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
  let stopped = false;
  void ensureSocialAuthReady()
    .then((auth) => {
      if (stopped) return;
      socialAuthDebug('FIREBASE_AUTH_STATE_LISTENER_START', {});
      unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
        void (async () => {
          if (stopped || isLogoutInProgress() || !firebaseUser?.email) return;
          try {
            const token = await firebaseUser.getIdToken(false);
            if (stopped || isLogoutInProgress() || auth.currentUser !== firebaseUser) return;
            stashFirebaseIdToken(token);
          } catch {
            /* token refresh optional during bootstrap */
          }
          // Firebase identity is not proof of an AllModelAI server session.
        })();
      });
    })
    .catch(() => {});

  stopSync = () => {
    stopped = true;
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
