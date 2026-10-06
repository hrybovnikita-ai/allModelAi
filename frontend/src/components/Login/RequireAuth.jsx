import { useLanguage } from '../../lib/useLanguage';
import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { isGoogleRedirectRecoveryPending } from '../../lib/socialSignIn';
import { isLogoutInProgress, restoreSession, subscribeSessionCleared } from '../../lib/session';

export default function RequireAuth() {
  const { t } = useLanguage();
  const location = useLocation();
  const [session, setSession] = useState({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    restoreSession()
      .then((user) => {
        if (active) setSession({ status: user ? 'authenticated' : 'anonymous', user });
      })
      .catch(() => {
        if (active) setSession({ status: 'error' });
      });
    return () => { active = false; };
  }, [attempt]);

  useEffect(() => subscribeSessionCleared(() => {
    setSession({ status: 'anonymous', user: null });
  }), []);

  if (isGoogleRedirectRecoveryPending()) {
    return <main className="dashboard-page" role="status">{t('Finishing Google sign-in…')}</main>;
  }

  if (session.status === 'loading') {
    return <main className="dashboard-page" role="status">{t('Checking your session...')}</main>;
  }
  if (session.status === 'error') {
    return (
      <main className="dashboard-page">
        <p role="alert">{t('Could not connect. Please try again.')}</p>
        <button type="button" onClick={() => { setSession({ status: 'loading' }); setAttempt((value) => value + 1); }}>
          {t('Retry')}
        </button>
      </main>
    );
  }
  if (session.status === 'anonymous' || isLogoutInProgress()) {
    return (
      <Navigate
        to="/"
        replace
        state={{
          signedOut: true,
          from: location.pathname + location.search + location.hash,
          returnState: location.state,
        }}
      />
    );
  }
  return <Outlet context={{ user: session.user }} />;
}
