import { isBrowserLocalhostDev, usesRemoteApiOrigin } from './apiBase.js';

/**
 * Classify fetch failures for user-facing copy (no secrets).
 * @returns {{ code: string, message: string }}
 */
export function classifyNetworkError(error, context = {}) {
  const msg = String(error?.message || '');
  const status = error?.status;
  const firebaseCode = error?.code;

  if (firebaseCode === 'auth/popup-closed-by-user') {
    return { code: 'GOOGLE_POPUP_CLOSED', message: 'Google sign-in was cancelled.' };
  }
  if (firebaseCode === 'auth/popup-blocked') {
    return { code: 'GOOGLE_POPUP_BLOCKED', message: 'Your browser blocked the Google sign-in window.' };
  }
  if (firebaseCode === 'auth/unauthorized-domain') {
    return { code: 'FIREBASE_UNAUTHORIZED_DOMAIN', message: 'This site domain is not authorized in Firebase Authentication.' };
  }
  if (firebaseCode === 'auth/network-request-failed') {
    return {
      code: 'FIREBASE_NETWORK_ERROR',
      message:
        'Could not reach Google sign-in (Firebase). This is usually a network, VPN, proxy, DNS, or firewall issue—not an AllModelAI app bug.',
    };
  }
  if (/identitytoolkit\.googleapis\.com/i.test(msg) || /ERR_CONNECTION/i.test(msg)) {
    return {
      code: 'FIREBASE_NETWORK_ERROR',
      message:
        'Could not connect to Google Firebase Authentication. Check VPN/proxy, DNS, and firewall settings, then retry.',
    };
  }
  if (firebaseCode === 'REDIRECT_RESULT_MISSING' || firebaseCode === 'auth/web-storage-unsupported') {
    return { code: 'GOOGLE_REDIRECT_FAILED', message: msg || 'Google redirect sign-in could not be completed.' };
  }

  if (context.phase === 'auth' && (status === 401 || status === 403)) {
    return {
      code: 'AUTH_REJECTED',
      message: status === 401 ? 'Invalid email or password.' : 'Sign-in was rejected. Please try again.',
    };
  }
  if (context.phase === 'auth' && (msg.includes('Failed to fetch') || msg.includes('Network request failed'))) {
    return {
      code: 'AUTH_NETWORK_ERROR',
      message: 'Could not reach the sign-in server. Check your connection and try again.',
    };
  }
  if (context.phase === 'session' && status === 401) {
    return { code: 'BACKEND_SESSION_FAILED', message: 'No active server session. Sign in again.' };
  }
  if (context.phase === 'session' && status === 403) {
    return { code: 'SESSION_COOKIE_NOT_EFFECTIVE', message: 'Session cookie was not accepted. Check cookie settings and retry.' };
  }

  if (
    msg.includes('Failed to fetch')
    || msg.includes('Network request failed')
    || msg.includes('ERR_CONNECTION')
    || error?.name === 'TypeError'
  ) {
    if (/identitytoolkit\.googleapis\.com|securetoken\.googleapis\.com/i.test(msg)) {
      return {
        code: 'FIREBASE_NETWORK_ERROR',
        message:
          'Could not connect to Google Firebase Authentication. Check VPN/proxy, DNS, and firewall settings, then retry.',
      };
    }
    if (isBrowserLocalhostDev()) {
      return {
        code: 'BACKEND_UNREACHABLE',
        message: 'Could not reach the local API. Start the backend on port 5050 and ensure Vite proxies /api (see API_PROXY_TARGET).',
      };
    }
    if (usesRemoteApiOrigin()) {
      return {
        code: 'BACKEND_UNREACHABLE',
        message: 'Could not reach the AllModelAI server. Check your network or API configuration.',
      };
    }
    return {
      code: 'BACKEND_UNREACHABLE',
      message: 'Could not reach the server. Check your network and try again.',
    };
  }

  return { code: 'BACKEND_UNREACHABLE', message: msg || 'Request failed.' };
}
