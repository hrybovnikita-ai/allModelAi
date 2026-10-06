import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  isFreshLoginGraceActive,
  readStoredSessionUser,
  restoreSession,
  SESSION_UPDATED_EVENT,
  subscribeSessionCleared,
} from '../../lib/session.js';

const SessionContext = createContext(null);

export function SessionProvider({ children }) {
  const [state, setState] = useState(() => ({
    status: 'loading',
    user: readStoredSessionUser(),
  }));

  const applySessionUser = useCallback((user) => {
    if (user?.email) {
      setState({ status: 'authenticated', user });
      return;
    }
    const hint = readStoredSessionUser();
    if (hint?.email && isFreshLoginGraceActive()) {
      setState({ status: 'authenticated', user: hint });
      return;
    }
    setState({ status: 'anonymous', user: null });
  }, []);

  const refresh = useCallback(async ({ force = false } = {}) => {
    setState((current) => ({
      status: 'loading',
      user: current.user?.email ? current.user : readStoredSessionUser(),
    }));
    try {
      const user = await restoreSession({ force });
      applySessionUser(user);
      return user;
    } catch {
      setState({ status: 'error', user: null });
      return null;
    }
  }, [applySessionUser]);

  useEffect(() => {
    let active = true;
    void restoreSession()
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

  const value = useMemo(() => ({
    status: state.status,
    user: state.user,
    authLoading: state.status === 'loading',
    refresh,
  }), [state.status, state.user, refresh]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession must be used within SessionProvider');
  }
  return context;
}
