import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { bootstrapAuthenticatedUser } from '../../lib/authBootstrap.js';
import {
  authBootstrapTimeoutMs,
  AUTH_STATUS,
  isAuthInitializing,
} from '../../lib/authSessionStatus.js';
import { classifyNetworkError } from '../../lib/networkErrors.js';
import { isGoogleRedirectRecoveryInFlight } from '../../lib/googleRedirectRecovery.js';
import {
  hasSessionRestoreHint,
  isFreshLoginGraceActive,
  restoreSession,
  SESSION_UPDATED_EVENT,
  subscribeSessionCleared,
} from '../../lib/session.js';
import { consumeSessionRestoreMeta } from '../../lib/sessionRestoreMeta.js';
import {
  GOOGLE_POPUP_SIGNIN_EVENT,
  isGooglePopupSignInActive,
  reconcileStaleRedirectIntent,
  shouldShowGoogleRedirectRecoveryUI,
} from '../../lib/socialRedirectState.js';
import { socialAuthDebug } from '../../lib/socialAuthDiagnostics.js';
import { COOKIE_CONSENT_UPDATED_EVENT } from '../../lib/cookieConsent.js';

export const SessionContext = createContext(null);

function initialStatus() {
  reconcileStaleRedirectIntent();
  if (shouldShowGoogleRedirectRecoveryUI()) {
    return AUTH_STATUS.CHECKING_REDIRECT;
  }
  return AUTH_STATUS.CHECKING_SESSION;
}

function connectionIssueFromError(error) {
  return classifyNetworkError(error, { phase: 'session' });
}

export function SessionProvider({ children }) {
  const [state, setState] = useState(() => ({
    status: initialStatus(),
    user: null,
    sessionVerified: false,
    connectionIssue: null,
  }));

  const applySessionUser = useCallback((user) => {
    const meta = consumeSessionRestoreMeta();
    if (user?.email) {
      if (meta.verified === false) {
        socialAuthDebug('SESSION_PROVIDER_DEGRADED', { email: user.email, code: meta.issue?.code });
        setState({
          status: AUTH_STATUS.CONNECTION_ISSUE,
          user,
          sessionVerified: false,
          connectionIssue: meta.issue || connectionIssueFromError(new Error('Could not reach the server.')),
        });
        return;
      }
      socialAuthDebug('SESSION_PROVIDER_AUTHENTICATED', { source: 'applySessionUser', email: user.email });
      setState({
        status: AUTH_STATUS.AUTHENTICATED,
        user,
        sessionVerified: true,
        connectionIssue: null,
      });
      return;
    }
    setState((current) => {
      if (shouldShowGoogleRedirectRecoveryUI() || isGoogleRedirectRecoveryInFlight()) {
        return {
          status: AUTH_STATUS.CHECKING_REDIRECT,
          user: current.user?.email ? current.user : null,
          sessionVerified: false,
          connectionIssue: null,
        };
      }
      if (isGooglePopupSignInActive()) {
        socialAuthDebug('SESSION_PROVIDER_PRESERVED', { phase: 'popup-sign-in' });
        return {
          status: AUTH_STATUS.CHECKING_SESSION,
          user: current.user?.email ? current.user : null,
          sessionVerified: current.sessionVerified,
          connectionIssue: current.connectionIssue,
        };
      }
      if (current.status === AUTH_STATUS.AUTHENTICATED && current.user?.email && isFreshLoginGraceActive()) {
        socialAuthDebug('SESSION_PROVIDER_PRESERVED', { phase: 'fresh-login-grace' });
        return current;
      }
      if (
        (current.status === AUTH_STATUS.AUTHENTICATED || current.status === AUTH_STATUS.CONNECTION_ISSUE)
        && current.user?.email
        && hasSessionRestoreHint()
      ) {
        socialAuthDebug('SESSION_PROVIDER_PRESERVED', { phase: 'stale-bootstrap-null' });
        return current;
      }
      socialAuthDebug('SESSION_PROVIDER_ANONYMOUS', {});
      return {
        status: AUTH_STATUS.UNAUTHENTICATED,
        user: null,
        sessionVerified: false,
        connectionIssue: null,
      };
    });
  }, []);

  const refresh = useCallback(async ({ force = false } = {}) => {
    if (shouldShowGoogleRedirectRecoveryUI()) {
      setState((current) => ({
        status: AUTH_STATUS.CHECKING_REDIRECT,
        user: null,
        sessionVerified: false,
        connectionIssue: null,
      }));
    } else if (force) {
      setState((current) => ({
        status: AUTH_STATUS.CHECKING_SESSION,
        user: current.user?.email ? current.user : null,
        sessionVerified: false,
        connectionIssue: current.connectionIssue,
      }));
    }
    try {
      const user = force
        ? await restoreSession({ force: true })
        : await bootstrapAuthenticatedUser();
      applySessionUser(user);
      return user;
    } catch (error) {
      socialAuthDebug('SESSION_PROVIDER_ERROR', { message: error?.message });
      setState((current) => {
        if (current.user?.email && hasSessionRestoreHint()) {
          return {
            status: AUTH_STATUS.CONNECTION_ISSUE,
            user: current.user,
            sessionVerified: false,
            connectionIssue: connectionIssueFromError(error),
          };
        }
        return {
          status: AUTH_STATUS.ERROR,
          user: null,
          sessionVerified: false,
          connectionIssue: connectionIssueFromError(error),
        };
      });
      return null;
    }
  }, [applySessionUser]);

  useEffect(() => {
    let active = true;
    void bootstrapAuthenticatedUser()
      .then((user) => {
        if (active) applySessionUser(user);
      })
      .catch((error) => {
        if (!active) return;
        socialAuthDebug('SESSION_PROVIDER_ERROR', { message: error?.message });
        if (shouldShowGoogleRedirectRecoveryUI() || isGoogleRedirectRecoveryInFlight()) {
          setState({
            status: AUTH_STATUS.CHECKING_REDIRECT,
            user: null,
            sessionVerified: false,
            connectionIssue: null,
          });
          return;
        }
        reconcileStaleRedirectIntent();
        setState((current) => {
          if (current.user?.email && hasSessionRestoreHint()) {
            return {
              status: AUTH_STATUS.CONNECTION_ISSUE,
              user: current.user,
              sessionVerified: false,
              connectionIssue: connectionIssueFromError(error),
            };
          }
          return {
            status: AUTH_STATUS.ERROR,
            user: current.user?.email ? current.user : null,
            sessionVerified: false,
            connectionIssue: connectionIssueFromError(error),
          };
        });
      });
    return () => {
      active = false;
    };
  }, [applySessionUser]);

  useEffect(() => {
    if (!isAuthInitializing(state.status)) return undefined;
    const timer = setTimeout(() => {
      setState((current) => {
        if (!isAuthInitializing(current.status)) return current;
        if (shouldShowGoogleRedirectRecoveryUI() || isGoogleRedirectRecoveryInFlight()) {
          socialAuthDebug('SESSION_PROVIDER_INIT_TIMEOUT_DEFERRED', { phase: 'redirect-recovery' });
          return current;
        }
        socialAuthDebug('SESSION_PROVIDER_INIT_TIMEOUT', {});
        reconcileStaleRedirectIntent();
        if (current.user?.email && hasSessionRestoreHint()) {
          return {
            ...current,
            status: AUTH_STATUS.CONNECTION_ISSUE,
            sessionVerified: false,
            connectionIssue: current.connectionIssue || {
              code: 'SESSION_CHECK_TIMEOUT',
              message: 'Session verification is taking longer than expected. You can keep using the app while we retry.',
            },
          };
        }
        return {
          status: AUTH_STATUS.UNAUTHENTICATED,
          user: null,
          sessionVerified: false,
          connectionIssue: null,
        };
      });
    }, authBootstrapTimeoutMs(state.status));
    return () => clearTimeout(timer);
  }, [state.status]);

  useEffect(() => subscribeSessionCleared(() => {
    setState({
      status: AUTH_STATUS.UNAUTHENTICATED,
      user: null,
      sessionVerified: false,
      connectionIssue: null,
    });
  }), []);

  useEffect(() => {
    const onPopupSignIn = (event) => {
      if (event.detail?.active) return;
      reconcileStaleRedirectIntent();
      if (shouldShowGoogleRedirectRecoveryUI()) return;
      void refresh({ force: true });
    };
    globalThis.addEventListener(GOOGLE_POPUP_SIGNIN_EVENT, onPopupSignIn);
    return () => globalThis.removeEventListener(GOOGLE_POPUP_SIGNIN_EVENT, onPopupSignIn);
  }, [refresh]);

  useEffect(() => {
    const onUpdated = (event) => {
      const user = event.detail?.user;
      if (user?.email) {
        setState({
          status: AUTH_STATUS.AUTHENTICATED,
          user,
          sessionVerified: true,
          connectionIssue: null,
        });
      }
    };
    globalThis.addEventListener(SESSION_UPDATED_EVENT, onUpdated);
    return () => globalThis.removeEventListener(SESSION_UPDATED_EVENT, onUpdated);
  }, []);

  useEffect(() => {
    const onConsent = (event) => {
      if (event.detail?.value === 'accepted') {
        void refresh({ force: true });
      }
    };
    globalThis.addEventListener(COOKIE_CONSENT_UPDATED_EVENT, onConsent);
    return () => globalThis.removeEventListener(COOKIE_CONSENT_UPDATED_EVENT, onConsent);
  }, [refresh]);

  useEffect(() => {
    if (state.status !== AUTH_STATUS.CONNECTION_ISSUE) return undefined;
    const delays = [5000, 15000, 45000];
    let attempt = 0;
    let timer;
    const schedule = () => {
      if (attempt >= delays.length) return;
      timer = setTimeout(() => {
        attempt += 1;
        void refresh({ force: true }).finally(schedule);
      }, delays[attempt]);
    };
    schedule();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [state.status, refresh]);

  const authLoading = isAuthInitializing(state.status);

  const value = useMemo(() => ({
    status: state.status,
    user: state.user,
    authLoading,
    sessionVerified: state.sessionVerified,
    connectionIssue: state.connectionIssue,
    refresh,
    /** @deprecated use status === AUTH_STATUS.AUTHENTICATED && sessionVerified */
    serverSessionVerified: state.status === AUTH_STATUS.AUTHENTICATED && state.sessionVerified,
  }), [state.status, state.user, state.sessionVerified, state.connectionIssue, authLoading, refresh]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession must be used within SessionProvider');
  }
  return context;
}
