import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { bootstrapAuthenticatedUser } from '../../lib/authBootstrap.js';
import { AUTH_STATUS, isAuthInitializing } from '../../lib/authSessionStatus.js';
import {
  restoreSession,
  SESSION_UPDATED_EVENT,
  subscribeSessionCleared,
} from '../../lib/session.js';
import {
  isGoogleRedirectRecoveryPending,
  reconcileStaleRedirectIntent,
} from '../../lib/socialSignIn.js';
import { socialAuthDebug } from '../../lib/socialAuthDiagnostics.js';
import { COOKIE_CONSENT_UPDATED_EVENT } from '../../lib/cookieConsent.js';

export const SessionContext = createContext(null);

function initialStatus() {
  if (isGoogleRedirectRecoveryPending()) {
    return AUTH_STATUS.CHECKING_REDIRECT;
  }
  return AUTH_STATUS.INITIALIZING;
}

export function SessionProvider({ children }) {
  const bootstrapStarted = useRef(false);
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
    if (isGoogleRedirectRecoveryPending()) {
      setState({ status: AUTH_STATUS.CHECKING_REDIRECT, user: null });
      return;
    }
    socialAuthDebug('SESSION_PROVIDER_ANONYMOUS', {});
    setState({ status: AUTH_STATUS.UNAUTHENTICATED, user: null });
  }, []);

  const refresh = useCallback(async ({ force = false } = {}) => {
    if (isGoogleRedirectRecoveryPending()) {
      setState({ status: AUTH_STATUS.CHECKING_REDIRECT, user: null });
    } else {
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
    if (bootstrapStarted.current) return undefined;
    bootstrapStarted.current = true;
    let active = true;
    void bootstrapAuthenticatedUser()
      .then((user) => {
        if (active) applySessionUser(user);
      })
      .catch((error) => {
        if (active) {
          socialAuthDebug('SESSION_PROVIDER_ERROR', { message: error?.message });
          reconcileStaleRedirectIntent();
          setState({ status: AUTH_STATUS.ERROR, user: null });
        }
      });
    return () => {
      active = false;
    };
  }, [applySessionUser]);

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
