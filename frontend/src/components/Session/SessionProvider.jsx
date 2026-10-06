import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { bootstrapAuthenticatedUser } from '../../lib/authBootstrap.js';
import {
  isFreshLoginGraceActive,
  readStoredSessionUser,
  restoreSession,
  SESSION_UPDATED_EVENT,
  subscribeSessionCleared,
} from '../../lib/session.js';
import { isGoogleRedirectRecoveryPending } from '../../lib/socialSignIn.js';
import { socialAuthDebug } from '../../lib/socialAuthDiagnostics.js';
import { COOKIE_CONSENT_UPDATED_EVENT } from '../../lib/cookieConsent.js';

const SessionContext = createContext(null);

function initialStatus() {
  if (isGoogleRedirectRecoveryPending()) {
    return 'checking-redirect';
  }
  return 'loading';
}

export function SessionProvider({ children }) {
  const [state, setState] = useState(() => ({
    status: initialStatus(),
    user: readStoredSessionUser(),
  }));

  const applySessionUser = useCallback((user) => {
    if (user?.email) {
      socialAuthDebug('SESSION_PROVIDER_AUTHENTICATED', { source: 'applySessionUser', email: user.email });
      setState({ status: 'authenticated', user });
      return;
    }
    if (isGoogleRedirectRecoveryPending()) {
      setState((current) => ({
        status: 'checking-redirect',
        user: current.user?.email ? current.user : readStoredSessionUser(),
      }));
      return;
    }
    const hint = readStoredSessionUser();
    if (hint?.email && isFreshLoginGraceActive()) {
      setState({ status: 'authenticated', user: hint });
      return;
    }
    socialAuthDebug('SESSION_PROVIDER_ANONYMOUS', {});
    setState({ status: 'anonymous', user: null });
  }, []);

  const refresh = useCallback(async ({ force = false } = {}) => {
    setState((current) => ({
      status: isGoogleRedirectRecoveryPending() ? 'checking-redirect' : 'restoring-session',
      user: current.user?.email ? current.user : readStoredSessionUser(),
    }));
    try {
      const user = force
        ? await restoreSession({ force: true })
        : await bootstrapAuthenticatedUser();
      applySessionUser(user);
      return user;
    } catch {
      setState({ status: 'error', user: null });
      return null;
    }
  }, [applySessionUser]);

  useEffect(() => {
    let active = true;
    void bootstrapAuthenticatedUser()
      .then((user) => {
        if (active) applySessionUser(user);
      })
      .catch(() => {
        if (active) setState({ status: 'error', user: null });
      });
    return () => {
      active = false;
    };
  }, [applySessionUser]);

  useEffect(() => subscribeSessionCleared(() => {
    setState({ status: 'anonymous', user: null });
  }), []);

  useEffect(() => {
    const onUpdated = (event) => {
      const user = event.detail?.user;
      if (user?.email) {
        setState({ status: 'authenticated', user });
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

  const authLoading = state.status === 'loading'
    || state.status === 'checking-redirect'
    || state.status === 'restoring-session';

  const value = useMemo(() => ({
    status: state.status,
    user: state.user,
    authLoading,
    refresh,
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
