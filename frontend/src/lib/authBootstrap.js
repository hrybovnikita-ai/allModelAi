import { prefersSameOriginApi } from './apiBase.js';
import {
  awaitGoogleRedirectRecovery,
  clearSocialRedirectIntent,
  isGoogleRedirectRecoveryPending,
  reconcileStaleRedirectIntent,
} from './socialSignIn.js';
import {
  shouldAttemptGoogleRedirectRecovery,
} from './socialRedirectState.js';
import { restoreSession } from './session.js';
import { authRecoveryLog, socialAuthDebug } from './socialAuthDiagnostics.js';

let bootstrapPromise = null;

async function runBootstrapAuthenticatedUser() {
  reconcileStaleRedirectIntent();

  if (isGoogleRedirectRecoveryPending() && !shouldAttemptGoogleRedirectRecovery()) {
    clearSocialRedirectIntent();
  }

  if (isGoogleRedirectRecoveryPending()) {
    socialAuthDebug('REDIRECT_RECOVERY_START', {
      pathname: typeof window !== 'undefined' ? window.location.pathname : '',
    });
  }

  const recoveredUser = await awaitGoogleRedirectRecovery('SessionBootstrap');
  if (recoveredUser?.email) {
    socialAuthDebug('REDIRECT_RESULT_FOUND', { email: recoveredUser.email });
    socialAuthDebug('SESSION_PROVIDER_AUTHENTICATED', { source: 'redirect-recovery' });
    return recoveredUser;
  }
  if (isGoogleRedirectRecoveryPending()) {
    reconcileStaleRedirectIntent();
    if (isGoogleRedirectRecoveryPending()) {
      authRecoveryLog('Clearing stale Google redirect intent after bootstrap recovery miss');
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
