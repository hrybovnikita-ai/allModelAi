import { confirmSession } from './session.js';

const headers = { 'Content-Type': 'application/json', 'X-AllModelAI-Auth': '1' };
async function post(url, body) {
  const response = await fetch(url, { method: 'POST', credentials: 'include', headers, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.message || 'Could not complete social sign-in. Please retry.'), { code: data.code });
  return data;
}
export function prepareSocialSession({ link = false } = {}) {
  return post('/api/auth/firebase/challenge', { intent: link ? 'link' : 'login' });
}
export async function exchangeSocialSession(idToken, { link = false, rememberMe = true, challenge } = {}) {
  const intent = link ? 'link' : 'login';
  const { state } = challenge || await prepareSocialSession({ link });
  const data = await post('/api/auth/firebase', { idToken, state, intent, rememberMe });
  // No navigation or trusted profile cache until the actual cookie works.
  return confirmSession(data.user);
}

export function socialError(error) {
  const messages = {
    'auth/popup-closed-by-user': 'Sign-in was canceled. You can try again.',
    'auth/cancelled-popup-request': 'Another sign-in window is open. Complete it or try again.',
    'auth/popup-blocked': 'Your browser blocked the sign-in window. Allow popups for this site, then retry in Safari, Chrome or Firefox.',
    'auth/network-request-failed': 'Could not reach the provider. Check your connection and retry.',
    'auth/unauthorized-domain': 'This website domain is not authorized in Firebase Authentication. Contact the administrator.',
    'auth/operation-not-allowed': 'This provider is not enabled in Firebase Authentication yet.',
    'auth/account-exists-with-different-credential': 'Sign in with your original provider. To connect another provider, use Settings > Connected accounts.',
    'auth/invalid-credential': 'The provider credential is invalid or expired. Try signing in again.',
    'auth/web-storage-unsupported': 'This browser blocks the storage needed by the provider. Open this site in your regular browser and retry.',
  };
  return messages[error.code] || error.message || 'Social sign-in failed. Please retry.';
}
