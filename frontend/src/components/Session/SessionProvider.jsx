import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { bootstrapAuthenticatedUser } from '../../lib/authBootstrap.js';
import {
  authBootstrapTimeoutMs,
  AUTH_STATUS,
  isAuthInitializing,
} from '../../lib/authSessionStatus.js';
import { isGoogleRedirectRecoveryInFlight } from '../../lib/googleRedirectRecovery.js';
import {
  hasSessionRestoreHint,
  restoreSession,
  SESSION_UPDATED_EVENT,
  subscribeSessionCleared,
} from '../../lib/session.js';
import {
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
  if (!hasSessionRestoreHint()) {
    return AUTH_STATUS.UNAUTHENTICATED;
  }
  return AUTH_STATUS.INITIALIZING;
}

export function SessionProvider({ children }) {
  const [state, setState] = useState(() => ({
    status: initialStatus(),
    user: null,
  }));

  const applySessionUser = useCallback((user) => {
    if (user?.email) {
      socialAuthDebug('SESSION_PROVIDER_AUTHENTICATED', { source: 'applySessionUser', email: user.email });
      setState({ status: AUTH_STATUS.AUTHENTICATED, user });
      return;
    }
    if (shouldShowGoogleRedirectRecoveryUI()) {
      setState({ status: AUTH_STATUS.CHECKING_REDIRECT, user: null });
      return;
    }
    socialAuthDebug('SESSION_PROVIDER_ANONYMOUS', {});
    setState({ status: AUTH_STATUS.UNAUTHENTICATED, user: null });
  }, []);

  const refresh = useCallback(async ({ force = false } = {}) => {
    if (shouldShowGoogleRedirectRecoveryUI()) {
      setState({ status: AUTH_STATUS.CHECKING_REDIRECT, user: null });
    } else if (force) {
      setState((current) => ({
        status: AUTH_STATUS.INITIALIZING,
        user: current.status === AUTH_STATUS.AUTHENTICATED ? current.user : null,
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
      setState({ status: AUTH_STATUS.ERROR, user: null });
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
        if (active) {
          socialAuthDebug('SESSION_PROVIDER_ERROR', { message: error?.message });
          if (shouldShowGoogleRedirectRecoveryUI() || isGoogleRedirectRecoveryInFlight()) {
            setState({ status: AUTH_STATUS.CHECKING_REDIRECT, user: null });
            return;
          }
          reconcileStaleRedirectIntent();
          setState({ status: AUTH_STATUS.UNAUTHENTICATED, user: null });
        }
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
        return { status: AUTH_STATUS.UNAUTHENTICATED, user: null };
      });
    }, authBootstrapTimeoutMs(state.status));
    return () => clearTimeout(timer);
  }, [state.status]);

  useEffect(() => subscribeSessionCleared(() => {
    setState({ status: AUTH_STATUS.UNAUTHENTICATED, user: null });
  }), []);

  useEffect(() => {
    const onUpdated = (event) => {
      const user = event.detail?.user;
      if (user?.email) {
        setState({ status: AUTH_STATUS.AUTHENTICATED, user });
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

  const authLoading = isAuthInitializing(state.status);

  const value = useMemo(() => ({
    status: state.status,
    user: state.user,
    authLoading,
    refresh,
    /** @deprecated use status === AUTH_STATUS.AUTHENTICATED */
    serverSessionVerified: state.status === AUTH_STATUS.AUTHENTICATED,
  }), [state.status, state.user, authLoading, refresh]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession must be used within SessionProvider');
  }
  return context;
}
