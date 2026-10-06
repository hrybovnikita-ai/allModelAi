import { authPost, resolveAuthApiUrl } from './authApi.js';
import { applyAuthResponsePayload, confirmSession } from './session.js';
import { socialAuthDebug } from './socialAuthDiagnostics.js';

async function post(path, body) {
  const apiPath = path.startsWith('/') ? path : `/api/auth/${String(path).replace(/^\//, '')}`;
  try {
    const { data, response } = await authPost(path, body, {
      headers: { 'X-AllModelAI-Auth': '1' },
    });
    socialAuthDebug('BACKEND_AUTH_API_OK', {
      pathname: new URL(resolveAuthApiUrl(path), 'https://localhost').pathname,
      method: 'POST',
      status: response?.status,
    });
    return data;
  } catch (error) {
    socialAuthDebug('BACKEND_CHALLENGE_FAILED', {
      pathname: apiPath,
      method: 'POST',
      status: error.status,
      code: error.code,
      contentType: error.data ? 'application/json' : undefined,
    });
    const code = error.code
      || (error.status === 404 ? 'AUTH_API_NOT_FOUND' : undefined)
      || (error.status === 401 ? 'AUTH_API_UNAUTHORIZED' : undefined)
      || (error.status >= 500 ? 'AUTH_API_SERVER_ERROR' : undefined)
      || (error.message?.includes('Failed to fetch') || error.message?.includes('Network request failed')
        ? 'AUTH_API_NETWORK_ERROR'
        : undefined);
    throw Object.assign(new Error(error.message || 'Could not complete social sign-in. Please retry.'), {
      code,
      status: error.status,
    });
  }
}
export function prepareSocialSession({ link = false } = {}) {
  return post('firebase/challenge', { intent: link ? 'link' : 'login' });
}
export async function exchangeSocialSession(idToken, {
  link = false,
  rememberMe = true,
  challenge,
  githubAccessToken,
  githubEmail,
} = {}) {
  const intent = link ? 'link' : 'login';
  const { state } = challenge || await prepareSocialSession({ link });
  const body = { state, intent, rememberMe };
  if (idToken) body.idToken = idToken;
  if (githubAccessToken) body.githubAccessToken = githubAccessToken;
  if (githubEmail) body.githubEmail = githubEmail;
  if (!body.idToken && !body.githubAccessToken) {
    throw Object.assign(new Error('Could not complete social sign-in. Please retry.'), { code: 'SOCIAL_AUTH_FAILED' });
  }
  const data = await post('firebase', body);
  applyAuthResponsePayload(data);
  socialAuthDebug('BACKEND_SET_SESSION_COMPLETE', { email: data.user?.email });
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
    'auth/web-storage-unsupported':
      'Google sign-in cannot finish in Private Browsing (Safari blocks session storage for the redirect). '
      + 'Use a regular Safari tab, or sign in with email and password.',
    'auth/email-not-verified': 'Your provider email is not verified yet. Verify it with the provider, then try again.',
    'auth/missing-email': 'GitHub did not share an email address. In GitHub → Settings → Emails, add and verify a primary email (or allow email visibility for OAuth), then try again.',
    INVALID_STATE: 'Sign-in expired. Please try again.',
    VERIFIED_EMAIL_REQUIRED: 'A verified email is required from your provider.',
    IDENTITY_CONFLICT: 'This provider account is already linked to another AllModelAI user.',
    SESSION_CHANGED: 'Your session changed. Sign in again and retry linking.',
    SOCIAL_AUTH_FAILED: 'We could not complete sign-in. Please try again.',
    REDIRECT_RESULT_MISSING:
      'Google sign-in could not be completed after redirect. Please try again, or use email and password.',
    AUTH_API_NOT_FOUND:
      'Sign-in service was not found on the server. Try again later or contact support.',
    AUTH_API_UNAUTHORIZED:
      'Sign-in was rejected by the server. Refresh the page and try again.',
    AUTH_API_SERVER_ERROR:
      'The sign-in server encountered an error. Please try again in a moment.',
    AUTH_API_NETWORK_ERROR:
      'Could not reach the AllModelAI sign-in service. Check your connection and retry.',
  };
  if (error.code && messages[error.code]) return messages[error.code];
  const providerHint = String(error.message || '');
  if (/apple/i.test(providerHint)) return "We couldn't complete Apple sign-in. Please try again.";
  if (/github/i.test(providerHint)) return 'GitHub authentication failed. Please try again.';
  return error.message || 'Social sign-in failed. Please retry.';
}
