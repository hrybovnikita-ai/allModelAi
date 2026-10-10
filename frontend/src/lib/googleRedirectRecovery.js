import { persistSocialAuthError, socialAuthDebug } from './socialAuthDiagnostics.js';
import { socialError } from './socialSession.js';
import { isGoogleRedirectRecoveryPending, shouldAttemptGoogleRedirectRecovery } from './socialRedirectState.js';

let bootstrapPromise = null;
let recoveryInFlight = false;

export function isGoogleRedirectRecoveryInFlight() {
  return recoveryInFlight;
}

/**
 * Runs once per full page load when a Google redirect sign-in is pending.
 * StrictMode-safe: module-level promise is shared across React mounts.
 */
export function bootstrapGoogleRedirectRecovery(runPipeline) {
  if (bootstrapPromise) {
    return bootstrapPromise;
  }

  if (!isGoogleRedirectRecoveryPending() || !shouldAttemptGoogleRedirectRecovery()) {
    return Promise.resolve(null);
  }

  recoveryInFlight = true;
  socialAuthDebug('REDIRECT_RECOVERY_PIPELINE_START', { consumer: 'AppBootstrap' });

  bootstrapPromise = runPipeline('AppBootstrap')
    .then((user) => {
      if (user?.email) {
        socialAuthDebug('REDIRECT_RECOVERY_PIPELINE_SUCCESS', { email: user.email });
      } else {
        socialAuthDebug('REDIRECT_RECOVERY_PIPELINE_EMPTY', {});
      }
      return user;
    })
    .catch((error) => {
      socialAuthDebug('REDIRECT_RECOVERY_FAILED', {
        code: error?.code,
        message: error?.message,
      });
      persistSocialAuthError(socialError(error));
      return null;
    })
    .finally(() => {
      recoveryInFlight = false;
      bootstrapPromise = null;
    });

  return bootstrapPromise;
}

export function getRedirectRecoveryPromise() {
  return bootstrapPromise;
}

export function waitForGoogleRedirectRecovery() {
  return bootstrapPromise || Promise.resolve(null);
}

export function resetGoogleRedirectBootstrapForTests() {
  bootstrapPromise = null;
  recoveryInFlight = false;
}
