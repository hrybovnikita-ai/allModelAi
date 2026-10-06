import { useLanguage } from '../../lib/useLanguage';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { isGoogleRedirectRecoveryPending } from '../../lib/socialSignIn';
import { isLogoutInProgress } from '../../lib/session';
import { useSession } from '../Session/SessionProvider';

export default function RequireAuth() {
  const { t } = useLanguage();
  const location = useLocation();
  const { status, user, authLoading, refresh } = useSession();

  if (isGoogleRedirectRecoveryPending()) {
    return <main className="dashboard-page" role="status">{t('Finishing Google sign-in…')}</main>;
  }

  if (authLoading) {
    return <main className="dashboard-page" role="status">{t('Checking your session...')}</main>;
  }
  if (status === 'error') {
    return (
      <main className="dashboard-page">
        <p role="alert">{t('Could not connect. Please try again.')}</p>
        <button type="button" onClick={() => { void refresh({ force: true }); }}>
          {t('Retry')}
        </button>
      </main>
    );
  }
  if (status === 'anonymous' || !user?.email || isLogoutInProgress()) {
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
  return <Outlet context={{ user }} />;
}
