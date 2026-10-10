import { ensureFirebaseSocialConfigLoaded } from './loadFirebaseConfig.js';
import { ensureSocialAuthReady, getEffectiveFirebaseConfig } from './firebase.js';
import { isMobileWebSafari } from './socialSignInEnv.js';
import { socialAuthDebug } from './socialAuthDiagnostics.js';
import { shouldAttemptGoogleRedirectRecovery } from './socialRedirectState.js';

let prerequisitesPromise = null;

/** Let IndexedDB / sessionStorage persistence settle before getRedirectResult (WebKit). */
export async function waitForRedirectOAuthSurfaceReady() {
  if (typeof window === 'undefined') return;
  await new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
  if (isMobileWebSafari()) {
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
}

/**
 * Firebase Auth must finish init + persistence before getRedirectResult on OAuth return.
 * Started from main.jsx as early as possible; awaited by redirect coordinator and recovery gate.
 */
export function startRedirectPrerequisitesPreload() {
  if (prerequisitesPromise) {
    return prerequisitesPromise;
  }

  prerequisitesPromise = (async () => {
    await ensureFirebaseSocialConfigLoaded();
    if (!shouldAttemptGoogleRedirectRecovery()) {
      return false;
    }
    await ensureSocialAuthReady();
    await waitForRedirectOAuthSurfaceReady();
    socialAuthDebug('REDIRECT_PREREQUISITES_READY', {
      authDomain: getEffectiveFirebaseConfig().authDomain,
    });
    return true;
  })().catch((error) => {
    prerequisitesPromise = null;
    socialAuthDebug('REDIRECT_PREREQUISITES_FAILED', {
      message: error?.message,
      code: error?.code,
    });
    throw error;
  });

  return prerequisitesPromise;
}

export async function ensureRedirectPrerequisitesReady() {
  return startRedirectPrerequisitesPreload();
}

export function resetRedirectPrerequisitesForTests() {
  prerequisitesPromise = null;
}
