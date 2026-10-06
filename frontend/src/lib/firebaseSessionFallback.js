/** Short-lived Firebase ID token for auth API retries when HttpOnly cookies lag on WebKit. */
let cachedFirebaseIdToken = null;
let cachedFirebaseIdTokenExpiresAt = 0;

export function stashFirebaseIdToken(token, expiresInSec = 3600) {
  if (!token || typeof token !== 'string') return;
  cachedFirebaseIdToken = token;
  cachedFirebaseIdTokenExpiresAt = Date.now() + Math.max(60, Number(expiresInSec) || 3600) * 1000;
}

export function clearFirebaseIdTokenFallback() {
  cachedFirebaseIdToken = null;
  cachedFirebaseIdTokenExpiresAt = 0;
}

export function firebaseSessionFallbackHeaders() {
  if (!cachedFirebaseIdToken || Date.now() >= cachedFirebaseIdTokenExpiresAt) {
    return {};
  }
  return { Authorization: `Bearer ${cachedFirebaseIdToken}` };
}
