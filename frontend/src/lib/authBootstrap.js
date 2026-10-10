import { prefersSameOriginApi } from './apiBase.js';
import {
  clearSocialRedirectIntent,
  isGoogleRedirectRecoveryPending,
  reconcileStaleRedirectIntent,
} from './socialSignIn.js';
import {
  shouldAttemptGoogleRedirectRecovery,
} from './socialRedirectState.js';
import { ensureRedirectPrerequisitesReady } from './authRedirectPreload.js';
import { isFreshLoginGraceActive, restoreSession } from './session.js';
import { authRecoveryLog, socialAuthDebug } from './socialAuthDiagnostics.js';
import { isGoogleRedirectRecoveryInFlight } from './googleRedirectRecovery.js';
import {
  isGooglePopupSignInActive,
  shouldShowGoogleRedirectRecoveryUI,
} from './socialRedirectState.js';

let bootstrapInflight = null;

async function runBootstrapAuthenticatedUser() {
  reconcileStaleRedirectIntent();

  if (isGoogleRedirectRecoveryPending() && !shouldAttemptGoogleRedirectRecovery()) {
    clearSocialRedirectIntent();
  }

  if (isGooglePopupSignInActive() || isFreshLoginGraceActive()) {
    socialAuthDebug('SESSION_CONFIRM_START', {
      sameOrigin: prefersSameOriginApi(),
      pathname: '/api/auth/session',
      method: 'GET',
      phase: 'fresh-login-or-popup',
    });
    const user = await restoreSession({ force: true });
    if (user?.email) {
      socialAuthDebug('SESSION_CONFIRM_OK', { email: user.email });
      socialAuthDebug('SESSION_PROVIDER_AUTHENTICATED', { source: 'restoreSession' });
    }
    return user;
  }

  if (shouldShowGoogleRedirectRecoveryUI() || isGoogleRedirectRecoveryPending()) {
    socialAuthDebug('REDIRECT_RECOVERY_DEFERRED', {
      pathname: typeof window !== 'undefined' ? window.location.pathname : '',
      owner: 'GoogleRedirectRecoveryGate',
    });
    try {
      await ensureRedirectPrerequisitesReady();
    } catch {
      /* Gate will surface errors */
    }
    if (isGoogleRedirectRecoveryInFlight() || shouldShowGoogleRedirectRecoveryUI()) {
      authRecoveryLog('Session bootstrap waiting on Google redirect recovery gate');
      return null;
    }
  }

  if (isGoogleRedirectRecoveryPending()) {
    reconcileStaleRedirectIntent();
    if (isGoogleRedirectRecoveryPending() && shouldAttemptGoogleRedirectRecovery()) {
      return null;
    }
    if (isGoogleRedirectRecoveryPending()) {
      authRecoveryLog('Clearing expired Google redirect intent after bootstrap defer');
      clearSocialRedirectIntent();
    }
  }

  socialAuthDebug('SESSION_CONFIRM_START', {
    sameOrigin: prefersSameOriginApi(),
    pathname: '/api/auth/session',
    method: 'GET',
  });

  const user = await restoreSession();
  if (user?.email) {
    socialAuthDebug('SESSION_CONFIRM_OK', { email: user.email });
    socialAuthDebug('SESSION_PROVIDER_AUTHENTICATED', { source: 'restoreSession' });
  } else {
    socialAuthDebug('SESSION_GUEST', { pathname: '/api/auth/session', phase: 'bootstrap' });
    socialAuthDebug('SESSION_PROVIDER_ANONYMOUS', {});
  }
  return user;
}

/**
 * Single client auth bootstrap: finish Google redirect recovery (if pending), then restore backend session.
 * Concurrent callers share one in-flight promise (StrictMode-safe).
 */
export function bootstrapAuthenticatedUser() {
  if (bootstrapInflight) {
    return bootstrapInflight;
  }
  bootstrapInflight = runBootstrapAuthenticatedUser()
    .catch((error) => {
      throw error;
    })
    .finally(() => {
      bootstrapInflight = null;
    });
  return bootstrapInflight;
}

export function resetAuthBootstrapForTests() {
  bootstrapInflight = null;
}

/** Drop in-flight bootstrap so a fresh login re-reads the session (avoids stale null from redirect defer). */
export function invalidateAuthBootstrap() {
  bootstrapInflight = null;
}
