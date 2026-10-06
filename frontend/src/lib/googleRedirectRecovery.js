import { isGoogleRedirectRecoveryPending } from './socialRedirectState.js';

let bootstrapPromise = null;

/**
 * Runs once per full page load when a Google redirect sign-in is pending.
 * StrictMode-safe: module-level promise is shared across React mounts.
 */
export function bootstrapGoogleRedirectRecovery(runPipeline) {
  if (bootstrapPromise) {
    return bootstrapPromise;
  }

  if (!isGoogleRedirectRecoveryPending()) {
    bootstrapPromise = Promise.resolve(null);
    return bootstrapPromise;
  }

  bootstrapPromise = runPipeline('AppBootstrap').catch((error) => {
    bootstrapPromise = null;
    throw error;
  });

  return bootstrapPromise;
}

export function waitForGoogleRedirectRecovery() {
  return bootstrapPromise || Promise.resolve(null);
}

export function resetGoogleRedirectBootstrapForTests() {
  bootstrapPromise = null;
}
