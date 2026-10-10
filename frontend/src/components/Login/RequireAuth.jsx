import { useState } from 'react';
import { useLanguage } from '../../lib/useLanguage';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { isGoogleRedirectRecoveryPending } from '../../lib/socialSignIn';
import { isLogoutInProgress } from '../../lib/session';
import { AUTH_STATUS } from '../../lib/authSessionStatus';
import { useSession } from '../Session/SessionProvider';
import RouteErrorBoundary from '../ErrorBoundary/RouteErrorBoundary';
import ConnectionIssueBanner from '../ConnectionIssue/ConnectionIssueBanner';
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

function canRenderProtectedShell(status, user) {
  if (!user?.email || isLogoutInProgress()) return false;
  return status === AUTH_STATUS.AUTHENTICATED
    || status === AUTH_STATUS.CONNECTION_ISSUE
    || status === AUTH_STATUS.ERROR;
}

export default function RequireAuth() {
  const { t } = useLanguage();
  const location = useLocation();
  const {
    status,
    user,
    authLoading,
    sessionVerified,
    connectionIssue,
    refresh,
  } = useSession();
  const [retrying, setRetrying] = useState(false);

  const retryConnection = async () => {
    setRetrying(true);
    try {
      await refresh({ force: true });
    } finally {
      setRetrying(false);
    }
  };

  if (isGoogleRedirectRecoveryPending()) {
    return <AuthLoadingSkeleton message={t('Finishing Google sign-in…')} />;
  }

  const shellReady = canRenderProtectedShell(status, user);
  const showAuthSkeleton = authLoading && !shellReady;

  if (showAuthSkeleton) {
    return <AuthLoadingSkeleton message={t('Checking your session...')} />;
  }

  if (shellReady) {
    const bannerMessage = connectionIssue?.message
      || (status === AUTH_STATUS.ERROR
        ? t('Could not connect. Please try again.')
        : null)
      || (!sessionVerified
        ? t('Reconnecting to the server. Some features may be unavailable until your session is confirmed.')
        : null);

    return (
      <RouteErrorBoundary onRetry={() => { void refresh({ force: true }); }}>
        {bannerMessage ? (
          <ConnectionIssueBanner
            message={bannerMessage}
            onRetry={retryConnection}
            retrying={retrying}
          />
        ) : null}
        <Outlet
          context={{
            user,
            sessionVerified,
            connectionIssue,
            retrySession: retryConnection,
          }}
        />
      </RouteErrorBoundary>
    );
  }

  if (status === AUTH_STATUS.ERROR || status === 'error') {
    return (
      <main className="dashboard-page dashboard-violet require-auth-fallback">
        <ConnectionIssueBanner
          message={connectionIssue?.message || t('Could not connect. Please try again.')}
          onRetry={retryConnection}
          retrying={retrying}
        />
        <p className="require-auth-fallback__hint">
          {t('If you were signed in, the app will restore your workspace once the server responds.')}
        </p>
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

  return <AuthLoadingSkeleton message={t('Checking your session...')} />;
}
