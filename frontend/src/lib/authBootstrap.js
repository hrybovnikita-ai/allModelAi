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
import { restoreSession } from './session.js';
import { authRecoveryLog, socialAuthDebug } from './socialAuthDiagnostics.js';
import { isGoogleRedirectRecoveryInFlight } from './googleRedirectRecovery.js';
import { shouldShowGoogleRedirectRecoveryUI } from './socialRedirectState.js';

let bootstrapPromise = null;

async function runBootstrapAuthenticatedUser() {
  reconcileStaleRedirectIntent();

  if (isGoogleRedirectRecoveryPending() && !shouldAttemptGoogleRedirectRecovery()) {
    clearSocialRedirectIntent();
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
  if (!bootstrapPromise) {
    bootstrapPromise = runBootstrapAuthenticatedUser().catch((error) => {
      bootstrapPromise = null;
      throw error;
    });
  }
  return bootstrapPromise;
}

export function resetAuthBootstrapForTests() {
  bootstrapPromise = null;
}
