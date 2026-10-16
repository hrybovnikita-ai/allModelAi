import { persistSocialAuthError, socialAuthDebug } from './socialAuthDiagnostics.js';
import { socialError } from './socialSession.js';
import {
  isGooglePopupSignInActive,
  isGoogleRedirectRecoveryPending,
  setRedirectIntentReconcileBlocked,
  shouldAttemptGoogleRedirectRecovery,
} from './socialRedirectState.js';

let bootstrapPromise = null;
let recoveryInFlight = false;
/** Settled outcome for this page load (StrictMode remounts must not re-run getRedirectResult). */
let bootstrapSettled = undefined;

export function isGoogleRedirectRecoveryInFlight() {
  return recoveryInFlight;
}

/**
 * Runs once per full page load when a Google redirect sign-in is pending.
 * StrictMode-safe: module-level promise is shared across React mounts.
 * Result is cached after settle so remounts do not call getRedirectResult again.
 */
export function bootstrapGoogleRedirectRecovery(runPipeline) {
  if (bootstrapSettled !== undefined) {
    return Promise.resolve(bootstrapSettled);
  }
  if (bootstrapPromise) {
    return bootstrapPromise;
  }

  if (isGooglePopupSignInActive()) {
    bootstrapSettled = null;
    return Promise.resolve(null);
  }
  if (!isGoogleRedirectRecoveryPending() || !shouldAttemptGoogleRedirectRecovery()) {
    return Promise.resolve(null);
  }

  recoveryInFlight = true;
  setRedirectIntentReconcileBlocked(true);
  socialAuthDebug('REDIRECT_RECOVERY_PIPELINE_START', { consumer: 'AppBootstrap' });

  bootstrapPromise = runPipeline('AppBootstrap')
    .then((user) => {
      if (user?.email) {
        socialAuthDebug('REDIRECT_RECOVERY_PIPELINE_SUCCESS', { email: user.email });
        bootstrapSettled = user;
      } else {
        socialAuthDebug('REDIRECT_RECOVERY_PIPELINE_EMPTY', {});
        bootstrapSettled = null;
      }
      return bootstrapSettled;
    })
    .catch((error) => {
      socialAuthDebug('REDIRECT_RECOVERY_FAILED', {
        code: error?.code,
        message: error?.message,
      });
      persistSocialAuthError(socialError(error), error?.code || error?.diagnosticStage);
      bootstrapSettled = null;
      return null;
    })
    .finally(() => {
      recoveryInFlight = false;
      setRedirectIntentReconcileBlocked(false);
      bootstrapPromise = null;
    });

  return bootstrapPromise;
}

export function getRedirectRecoveryPromise() {
  if (bootstrapSettled !== undefined) {
    return Promise.resolve(bootstrapSettled);
  }
  return bootstrapPromise;
}

export function waitForGoogleRedirectRecovery() {
  return getRedirectRecoveryPromise() || Promise.resolve(null);
}

export function resetGoogleRedirectBootstrapForTests() {
  bootstrapPromise = null;
  recoveryInFlight = false;
  bootstrapSettled = undefined;
}
