import { authPost } from './authApi.js';
import { applyAuthResponsePayload, confirmSession } from './session.js';

async function post(path, body) {
  try {
    const { data } = await authPost(path, body, {
      headers: { 'X-AllModelAI-Auth': '1' },
    });
    return data;
  } catch (error) {
    throw Object.assign(new Error(error.message || 'Could not complete social sign-in. Please retry.'), {
      code: error.code,
    });
  }
}
export function prepareSocialSession({ link = false } = {}) {
  return post('firebase/challenge', { intent: link ? 'link' : 'login' });
}
export async function exchangeSocialSession(idToken, { link = false, rememberMe = true, challenge } = {}) {
  const intent = link ? 'link' : 'login';
  const { state } = challenge || await prepareSocialSession({ link });
  const data = await post('firebase', { idToken, state, intent, rememberMe });
  applyAuthResponsePayload(data);
  return confirmSession(data.user);
}

export function socialError(error) {
  const messages = {
    'auth/popup-closed-by-user': 'Google sign-in was cancelled.',
    'auth/cancelled-popup-request': 'Another sign-in window is open. Complete it or try again.',
    'auth/popup-blocked': 'Your browser blocked the sign-in window. Allow popups, or you will be redirected automatically.',
    'auth/network-request-failed': 'Could not reach the provider. Check your connection and retry.',
    'auth/unauthorized-domain': typeof window !== 'undefined'
      ? `This domain (${window.location.hostname}) is not authorized for Firebase OAuth. Add it under Firebase Authentication → Settings → Authorized domains.`
      : 'This website domain is not authorized in Firebase Authentication. Contact the administrator.',
    'auth/operation-not-allowed': 'This provider is not enabled in Firebase Authentication yet.',
    'auth/account-exists-with-different-credential': 'Sign in with your original provider. To connect another provider, use Settings > Connected accounts.',
    'auth/invalid-credential': 'The provider credential is invalid or expired. Try signing in again.',
    'auth/web-storage-unsupported': 'This browser blocks the storage needed by the provider. Open this site in your regular browser and retry.',
    'auth/email-not-verified': 'Your provider email is not verified yet. Verify it with the provider, then try again.',
    INVALID_STATE: 'Sign-in expired. Please try again.',
    VERIFIED_EMAIL_REQUIRED: 'A verified email is required from your provider.',
    IDENTITY_CONFLICT: 'This provider account is already linked to another AllModelAI user.',
    SESSION_CHANGED: 'Your session changed. Sign in again and retry linking.',
    SOCIAL_AUTH_FAILED: 'We could not complete sign-in. Please try again.',
  };
  if (error.code && messages[error.code]) return messages[error.code];
  const providerHint = String(error.message || '');
  if (/apple/i.test(providerHint)) return "We couldn't complete Apple sign-in. Please try again.";
  if (/github/i.test(providerHint)) return 'GitHub authentication failed. Please try again.';
  if (/google/i.test(providerHint)) return 'Google sign-in was cancelled.';
  return error.message || 'Social sign-in failed. Please retry.';
}
