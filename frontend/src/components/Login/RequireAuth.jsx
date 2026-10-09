import { useLanguage } from '../../lib/useLanguage';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { isGoogleRedirectRecoveryPending } from '../../lib/socialSignIn';
import { isLogoutInProgress } from '../../lib/session';
import { AUTH_STATUS } from '../../lib/authSessionStatus';
import { useSession } from '../Session/SessionProvider';
import RouteErrorBoundary from '../ErrorBoundary/RouteErrorBoundary';
import '../SocialAuth/SocialAuth.css';

function AuthLoadingSkeleton({ message }) {
  return (
    <main className="dashboard-page auth-loading-skeleton" role="status" aria-live="polite">
      <div className="auth-loading-skeleton-bar" aria-hidden="true" />
      <div className="auth-loading-skeleton-bar auth-loading-skeleton-bar--short" aria-hidden="true" />
      <p>{message}</p>
    </main>
  );
}

export default function RequireAuth() {
  const { t } = useLanguage();
  const location = useLocation();
  const { status, user, authLoading, refresh } = useSession();

  if (isGoogleRedirectRecoveryPending()) {
    return <AuthLoadingSkeleton message={t('Finishing Google sign-in…')} />;
  }

  if (authLoading) {
    return <AuthLoadingSkeleton message={t('Checking your session...')} />;
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
  if (status === AUTH_STATUS.UNAUTHENTICATED || status === 'anonymous' || !user?.email || isLogoutInProgress()) {
    const returnPath = location.pathname + location.search + location.hash;
    return (
      <Navigate
        to="/login"
        replace
        state={{
          from: returnPath,
          returnState: location.state,
        }}
      />
    );
  }
  return (
    <RouteErrorBoundary onRetry={() => { void refresh({ force: true }); }}>
      <Outlet context={{ user }} />
    </RouteErrorBoundary>
  );
}
