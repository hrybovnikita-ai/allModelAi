import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLanguage } from '../../lib/useLanguage';
import { performLogout } from '../../lib/session';
import { DASHBOARD_NAV_ACCOUNT_LINKS } from '../Dashboard/dashboardNavLinks';
import {
  authBootstrapTimeoutMs,
  AUTH_REDIRECT_RECOVERY_TIMEOUT_MS,
  AUTH_STATUS,
} from '../../lib/authSessionStatus';
import { isGoogleRedirectRecoveryInFlight } from '../../lib/googleRedirectRecovery';
import { shouldShowGoogleRedirectRecoveryUI } from '../../lib/socialRedirectState';
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

const NAV_USER_MENU_LINKS = DASHBOARD_NAV_ACCOUNT_LINKS.filter(
  (item) => item.label !== 'Dashboard',
);

export default function NavAuthSection({ onOpenAuth }) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { status, user, authLoading, refresh } = useSession();
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const userMenuRef = useRef(null);

  const closeUserMenu = () => {
    if (userMenuRef.current) {
      userMenuRef.current.open = false;
    }
  };

  const redirectRecoveryActive =
    status === AUTH_STATUS.CHECKING_REDIRECT
    || isGoogleRedirectRecoveryInFlight()
    || shouldShowGoogleRedirectRecoveryUI();

  useEffect(() => {
    if (!authLoading && !redirectRecoveryActive) {
      setLoadingTimedOut(false);
      return undefined;
    }
    const timeoutMs = redirectRecoveryActive
      ? AUTH_REDIRECT_RECOVERY_TIMEOUT_MS
      : authBootstrapTimeoutMs(status);
    const timer = setTimeout(() => setLoadingTimedOut(true), timeoutMs);
    return () => clearTimeout(timer);
  }, [authLoading, redirectRecoveryActive, status]);

  const isLoading = (authLoading || redirectRecoveryActive) && !loadingTimedOut;
  const isAuthenticated = (
    status === AUTH_STATUS.AUTHENTICATED
    || status === AUTH_STATUS.CONNECTION_ISSUE
  ) && Boolean(user?.email);
  const showSessionError =
    status === AUTH_STATUS.ERROR
    || status === 'error'
    || status === 'authentication-error'
    || ((authLoading && !redirectRecoveryActive) && loadingTimedOut);

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
          <details className="nav-user-menu" ref={userMenuRef}>
            <summary aria-label={t('Account menu')}>
              <span className="nav-user-menu-chevron" aria-hidden="true" />
            </summary>
            <div className="nav-user-menu-panel" role="menu">
              {NAV_USER_MENU_LINKS.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  role="menuitem"
                  onClick={closeUserMenu}
                >
                  {t(item.label)}
                </Link>
              ))}
            </div>
          </details>
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
