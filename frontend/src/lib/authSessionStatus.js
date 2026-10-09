/** Client auth state machine (SessionProvider). */
export const AUTH_STATUS = {
  INITIALIZING: 'initializing',
  CHECKING_REDIRECT: 'checking-redirect',
  AUTHENTICATED: 'authenticated',
  UNAUTHENTICATED: 'unauthenticated',
  ERROR: 'error',
};

export function isAuthInitializing(status) {
  return status === AUTH_STATUS.INITIALIZING
    || status === AUTH_STATUS.CHECKING_REDIRECT
    || status === 'loading'
    || status === 'restoring-session';
}

/** After this, navbar may show guest actions if bootstrap is still in flight. */
export const AUTH_INIT_TIMEOUT_MS = 8000;

/** Reserve space in the header while session is verifying (matches auth controls). */
export const NAV_AUTH_SKELETON_MIN_WIDTH_PX = 280;
