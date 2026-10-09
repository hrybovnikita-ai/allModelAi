import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLanguage } from '../../lib/useLanguage';
import { performLogout } from '../../lib/session';
import { AUTH_INIT_TIMEOUT_MS, AUTH_STATUS } from '../../lib/authSessionStatus';
import { useSession } from '../Session/SessionProvider';
import InstallPwaButton from '../InstallPwaButton/InstallPwaButton';

export default function NavAuthSection({ onOpenAuth }) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { status, user, authLoading } = useSession();
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);

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

  const signOut = async () => {
    await performLogout();
    navigate('/', { replace: true });
  };

  return (
    <>
      <InstallPwaButton />
      {isLoading ? (
        <span className="nav-auth-loading" role="status" aria-live="polite" aria-busy="true">
          <span className="nav-auth-spinner" aria-hidden="true" />
          <span className="nav-auth-loading-label">{t('Checking your session...')}</span>
        </span>
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
            <small>{user.name || user.email}</small>
          </Link>
          <Link to="/dashboard" className="nav-user-dashboard">{t('Dashboard')}</Link>
          <button type="button" className="nav-signout" onClick={() => { void signOut(); }}>
            {t('Sign out')}
          </button>
        </div>
      ) : (
        <>
          <button type="button" className="nav-signin" onClick={() => onOpenAuth('signin')}>{t('Sign in')}</button>
          <button type="button" className="nav-signup" onClick={() => onOpenAuth('signup')}>{t('Sign up')}</button>
        </>
      )}
    </>
  );
}
