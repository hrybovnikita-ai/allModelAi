import { authPost } from './authApi.js';
import { CLERK_SESSION_MARKER_KEY } from './clerkAuthConfig.js';
import {
  applyAuthResponsePayload,
  confirmSession,
  rememberSession,
} from './session.js';

const CLERK_LINK_MESSAGE =
  'An AllModelAI account already uses this email. Sign in with email or Google, then connect Clerk in Settings → Connected accounts.';

function clerkExchangeErrorMessage(error) {
  if (error?.code === 'CLERK_LINK_REQUIRED') return CLERK_LINK_MESSAGE;
  if (error?.code === 'CLERK_IDENTITY_CONFLICT') {
    return 'This Clerk account could not be matched to AllModelAI. Sign in with email or Google, then try Clerk again.';
  }
  return error?.message || 'Clerk sign-in could not be connected to AllModelAI.';
}

/** Permanent failures must not be retried automatically. */
export function isPermanentClerkExchangeFailure(error) {
  const status = Number(error?.status);
  const code = error?.code;
  return status === 409
    || code === 'CLERK_LINK_REQUIRED'
    || code === 'CLERK_IDENTITY_CONFLICT'
    || code === 'CLERK_EMAIL_REQUIRED';
}

/**
 * Exchange a Clerk session JWT for an AllModelAI HttpOnly cookie session.
 * @param {() => Promise<string | null>} getToken
 */
export async function exchangeClerkSessionForAllModelAI(getToken, { rememberMe = true } = {}) {
  const token = await getToken();
  if (!token) {
    const error = new Error('Clerk has not issued a session yet.');
    error.code = 'CLERK_NO_TOKEN';
    throw error;
  }
  let data;
  try {
    ({ data } = await authPost('/api/auth/clerk/exchange', { rememberMe }, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-AllModelAI-Auth': '1',
      },
    }));
  } catch (error) {
    throw Object.assign(new Error(clerkExchangeErrorMessage(error)), {
      code: error?.code,
      status: error?.status,
      cause: error,
    });
  }
  applyAuthResponsePayload(data);
  rememberSession(data.user, { serverVerified: false });
  const sessionUser = await confirmSession(data.user);
  rememberSession(sessionUser, { serverVerified: true });
  try {
    globalThis.sessionStorage?.setItem(CLERK_SESSION_MARKER_KEY, '1');
  } catch {
    /* private mode */
  }
  return { user: sessionUser, created: Boolean(data?.created) };
}

/** Best-effort Clerk client sign-out (safe when Clerk was never loaded). */
export async function signOutClerkClient() {
  try {
    const clerk = globalThis.Clerk;
    if (clerk && typeof clerk.signOut === 'function') {
      await clerk.signOut();
    }
  } catch {
    /* already signed out or Clerk not mounted */
  }
  try {
    globalThis.sessionStorage?.removeItem(CLERK_SESSION_MARKER_KEY);
  } catch {
    /* ignore */
  }
}

export function hadClerkClientSession() {
  try {
    return globalThis.sessionStorage?.getItem(CLERK_SESSION_MARKER_KEY) === '1';
  } catch {
    return false;
  }
}
