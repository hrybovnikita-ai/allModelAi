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

/** After this, UI may treat stuck bootstrap as guest (navbar, etc.). */
export const AUTH_INIT_TIMEOUT_MS = 3000;
