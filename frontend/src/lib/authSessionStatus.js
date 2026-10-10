/** Client auth state machine (SessionProvider). */
export const AUTH_STATUS = {
  INITIALIZING: 'initializing',
  CHECKING_SESSION: 'checking-session',
  CHECKING_REDIRECT: 'checking-redirect',
  AUTHENTICATED: 'authenticated',
  /** Server session not confirmed; UI may show cached profile with a connection warning. */
  CONNECTION_ISSUE: 'connection-issue',
  UNAUTHENTICATED: 'unauthenticated',
  ERROR: 'authentication-error',
};

export function isAuthInitializing(status) {
  return status === AUTH_STATUS.INITIALIZING
    || status === AUTH_STATUS.CHECKING_SESSION
    || status === AUTH_STATUS.CHECKING_REDIRECT
    || status === 'loading'
    || status === 'restoring-session';
}

/** After this, navbar may show guest actions if bootstrap is still in flight. */
export const AUTH_INIT_TIMEOUT_MS = 8000;

/** iPad/iPhone Safari: Firebase redirect + backend exchange can exceed 8s — keep loading UI until recovery finishes. */
export const AUTH_REDIRECT_RECOVERY_TIMEOUT_MS = 45000;

/** Session restore may retry for ~7s plus per-request timeouts while Render wakes up. */
export const AUTH_SESSION_RESTORE_TIMEOUT_MS = 22000;

export function authBootstrapTimeoutMs(status, { sessionRestorePending = false } = {}) {
  if (status === AUTH_STATUS.CHECKING_REDIRECT) {
    return AUTH_REDIRECT_RECOVERY_TIMEOUT_MS;
  }
  if (status === AUTH_STATUS.CHECKING_SESSION || status === AUTH_STATUS.INITIALIZING) {
    return sessionRestorePending ? AUTH_SESSION_RESTORE_TIMEOUT_MS : AUTH_INIT_TIMEOUT_MS;
  }
  return AUTH_INIT_TIMEOUT_MS;
}

/** Reserve space in the header while session is verifying (matches auth controls). */
export const NAV_AUTH_SKELETON_MIN_WIDTH_PX = 280;
