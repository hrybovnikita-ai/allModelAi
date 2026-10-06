import { Link, useNavigate } from 'react-router-dom';
import { useLanguage } from '../../lib/useLanguage';
import { performLogout } from '../../lib/session';
import { useSession } from '../Session/SessionProvider';
import InstallPwaButton from '../InstallPwaButton/InstallPwaButton';

export default function NavAuthSection({ onOpenAuth }) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { status, user, authLoading } = useSession();

  const signOut = async () => {
    try {
      await performLogout();
      navigate('/', { replace: true });
    } catch {
      /* ignore */
    }
  };

  return (
    <>
      <InstallPwaButton />
      {authLoading ? (
        <span className="nav-auth-loading" role="status" aria-live="polite">
          {t('Checking your session...')}
        </span>
      ) : status === 'authenticated' && user?.email ? (
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
