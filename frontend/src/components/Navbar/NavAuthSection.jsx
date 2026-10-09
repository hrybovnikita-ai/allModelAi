import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLanguage } from '../../lib/useLanguage';
import { performLogout } from '../../lib/session';
import { AUTH_INIT_TIMEOUT_MS, AUTH_STATUS } from '../../lib/authSessionStatus';
import { useSession } from '../Session/SessionProvider';
import InstallPwaButton from '../InstallPwaButton/InstallPwaButton';

function NavAuthSkeleton({ label }) {
  return (
    <div className="nav-auth-skeleton" role="status" aria-live="polite" aria-busy="true" aria-label={label}>
      <span className="nav-auth-skeleton__avatar" aria-hidden="true" />
      <span className="nav-auth-skeleton__line" aria-hidden="true" />
      <span className="nav-auth-skeleton__btn" aria-hidden="true" />
      <span className="nav-auth-skeleton__btn nav-auth-skeleton__btn--short" aria-hidden="true" />
    </div>
  );
}

export default function NavAuthSection({ onOpenAuth }) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { status, user, authLoading, refresh } = useSession();
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (!authLoading) {
      setLoadingTimedOut(false);
      return undefined;
    }
    const timer = setTimeout(() => setLoadingTimedOut(true), AUTH_INIT_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [authLoading]);

  const isLoading = authLoading && !loadingTimedOut;
  const isAuthenticated = status === AUTH_STATUS.AUTHENTICATED && Boolean(user?.email);
  const showSessionError = status === AUTH_STATUS.ERROR || (authLoading && loadingTimedOut);

  const signOut = async () => {
    await performLogout();
    navigate('/', { replace: true });
  };

  const retrySession = async () => {
    setRetrying(true);
    try {
      await refresh({ force: true });
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className="nav-auth-shell">
      <InstallPwaButton />
      {isLoading ? (
        <NavAuthSkeleton label={t('Loading account')} />
      ) : showSessionError ? (
        <div className="nav-auth-error" role="alert">
          <button type="button" className="nav-auth-retry" disabled={retrying} onClick={() => { void retrySession(); }}>
            {retrying ? t('Retrying…') : t('Retry')}
          </button>
        </div>
      ) : isAuthenticated ? (
        <div className="nav-user">
          <Link to="/dashboard" className="nav-user-identity">
            <span className="nav-user-avatar" aria-hidden="true">
              {user.avatar ? (
                <img src={user.avatar} alt="" referrerPolicy="no-referrer" />
              ) : (
                user.name?.charAt(0) || user.email.charAt(0)
              )}
            </span>
            <small className="nav-user-name">{user.name || user.email}</small>
          </Link>
          <Link to="/dashboard" className="nav-user-dashboard">{t('Dashboard')}</Link>
          <button type="button" className="nav-signout" onClick={() => { void signOut(); }}>
            {t('Sign out')}
          </button>
        </div>
      ) : (
        <div className="nav-auth-guest">
          <button type="button" className="nav-signin" onClick={() => onOpenAuth('signin')}>{t('Sign in')}</button>
          <button type="button" className="nav-signup" onClick={() => onOpenAuth('signup')}>{t('Sign up')}</button>
        </div>
      )}
    </div>
  );
}
