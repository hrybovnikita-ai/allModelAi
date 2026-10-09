import { parseJsonResponse } from './httpJson.js';

let unauthorizedRedirectInFlight = false;

const AUTH_EXEMPT_401_PATHS = [
  /^\/api\/auth\/session\b/,
  /^\/api\/auth\/logout\b/,
  /^\/api\/auth\/firebase\b/,
  /^\/api\/public\b/,
];

function requestPath(url) {
  try {
    const parsed = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return String(url).split('?')[0];
  }
}

function isExemptFromUnauthorizedRedirect(url) {
  const path = requestPath(url);
  return AUTH_EXEMPT_401_PATHS.some((pattern) => pattern.test(path));
}

export function resetUnauthorizedRedirectGuard() {
  unauthorizedRedirectInFlight = false;
}

export async function signOutFirebaseAuth() {
  try {
    const { signOut } = await import('firebase/auth');
    const { getSocialAuth } = await import('./firebase.js');
    await signOut(getSocialAuth()).catch(() => {});
  } catch {
    /* Firebase social auth not configured or already signed out */
  }
}

/** Clears local session hints, native token, Firebase user; does not call backend logout. */
export async function purgeClientAuthState() {
  await signOutFirebaseAuth();
  const { clearAllSessionData } = await import('./session.js');
  clearAllSessionData();
}

/**
 * @param {{ redirectTo?: string | null, reason?: string }} [options]
 * redirectTo null = no navigation (caller handles)
 */
export async function forceClientSignOut(options = {}) {
  const { redirectTo = '/', reason = '' } = options;
  await purgeClientAuthState();
  if (reason && typeof sessionStorage !== 'undefined') {
    try {
      sessionStorage.setItem('allmodelai_auth_notice', reason);
    } catch {
      /* private mode */
    }
  }
  if (redirectTo && typeof window !== 'undefined') {
    const target = redirectTo.startsWith('/') ? redirectTo : `/${redirectTo}`;
    if (window.location.pathname + window.location.search !== target) {
      window.location.assign(target);
    }
  }
}

export async function handleUnauthorizedApiResponse(url, { skipRedirect = false } = {}) {
  if (skipRedirect || isExemptFromUnauthorizedRedirect(url)) {
    return false;
  }
  if (unauthorizedRedirectInFlight) {
    return true;
  }
  unauthorizedRedirectInFlight = true;
  await forceClientSignOut({
    redirectTo: '/',
    reason: 'Your session has expired. Please sign in again.',
  });
  return true;
}

/**
 * DELETE /api/auth/account then always purge local auth (even on 401/network errors).
 * @returns {{ deleted: boolean, message: string | null }}
 */
export async function deleteUserAccountAndSignOut(email) {
  const { apiFetch } = await import('./api.js');
  let deleted = false;
  let message = null;

  try {
    const response = await apiFetch('/api/auth/account', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
      skipAuthRedirect: true,
    });
    const data = await parseJsonResponse(response).catch(() => ({}));
    if (response.ok) {
      deleted = true;
    } else if (response.status === 401) {
      message = 'Your session expired before the server could delete the account. You have been signed out on this device.';
    } else {
      message = data?.message || `Could not delete your account (HTTP ${response.status}). You have been signed out on this device.`;
    }
  } catch (error) {
    message = error?.message || 'Could not reach the server. You have been signed out on this device.';
  }

  await purgeClientAuthState();
  return { deleted, message };
}
