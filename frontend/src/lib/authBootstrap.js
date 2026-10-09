import { prefersSameOriginApi } from './apiBase.js';
import {
  awaitGoogleRedirectRecovery,
  clearSocialRedirectIntent,
  isGoogleRedirectRecoveryPending,
  reconcileStaleRedirectIntent,
} from './socialSignIn.js';
import { restoreSession } from './session.js';
import { authRecoveryLog, socialAuthDebug } from './socialAuthDiagnostics.js';

/**
 * Single client auth bootstrap: finish Google redirect recovery (if pending), then restore backend session.
 */
export async function bootstrapAuthenticatedUser() {
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
    socialAuthDebug('SESSION_CONFIRM_401', { pathname: '/api/auth/session' });
    socialAuthDebug('SESSION_PROVIDER_ANONYMOUS', {});
  }
  return user;
}
