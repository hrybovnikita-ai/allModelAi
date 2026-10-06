/**
 * Firebase signInWithRedirect stores OAuth "initial state" in sessionStorage.
 * Safari Private Browsing / ITP-partitioned contexts block it → Firebase shows
 * "Unable to process request due to missing initial state" on /__/auth/handler.
 */

export function isSessionStorageAvailable() {
  if (typeof sessionStorage === 'undefined') return false;
  try {
    const probe = '__allmodelai_storage_probe__';
    sessionStorage.setItem(probe, '1');
    sessionStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

export function isLocalStorageAvailable() {
  if (typeof localStorage === 'undefined') return false;
  try {
    const probe = '__allmodelai_storage_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

/** Required for Google redirect sign-in (Firebase Auth redirect handler). */
export function canUseGoogleRedirectSignIn() {
  return isSessionStorageAvailable();
}

export function assertGoogleRedirectStorageAvailable() {
  if (canUseGoogleRedirectSignIn()) return;
  throw Object.assign(
    new Error(
      'Google sign-in cannot run in Private Browsing because Safari blocks session storage '
      + 'needed to finish the redirect. Open a regular Safari tab, or use email and password.',
    ),
    { code: 'auth/web-storage-unsupported' },
  );
}
