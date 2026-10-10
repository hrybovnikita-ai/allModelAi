import { useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { performLogout } from '../../lib/session';
import { useSession } from '../Session/SessionProvider';
import { AllModelAILogoMark } from '../AllModelAILogo/AllModelAILogo';
import {
  DASHBOARD_NAV_ACCOUNT_LINKS,
  DASHBOARD_NAV_DESKTOP_MAIN,
  DASHBOARD_NAV_DESKTOP_MORE,
  DASHBOARD_NAV_LINKS,
} from './dashboardNavLinks';

export default function DashboardWorkspaceNav({ user: routeUser, onAuthError, onDeleteAccount }) {
  const navigate = useNavigate();
  const mobileMenuRef = useRef(null);
  const { user: sessionUser, authLoading } = useSession();
  const user = routeUser?.email ? routeUser : sessionUser;

  const closeMobileMenu = () => {
    if (mobileMenuRef.current) {
      mobileMenuRef.current.open = false;
    }
  };

  const signOut = async () => {
    const result = await performLogout();
    if (result.warning) {
      onAuthError?.(result.warning);
    }
    navigate('/', { replace: true });
  };

  if (authLoading && !user?.email) {
    return (
      <header className="dashboard-header dashboard-nav" role="status">
        <div className="dashboard-nav-bar">
          <span className="dashboard-session-loading">Checking your session…</span>
        </div>
      </header>
    );
  }

  if (!user?.email) return null;

  return (
    <header className="dashboard-header dashboard-nav">
      <div className="dashboard-nav-bar">
        <div className="header-brand dashboard-nav-left">
          <Link to="/dashboard" className="dashboard-brand">
            <AllModelAILogoMark />
            AllModelAI
          </Link>
        </div>
        <nav className="header-nav dashboard-nav-center" aria-label="Workspace navigation">
          <div className="dashboard-nav-links">
            {DASHBOARD_NAV_DESKTOP_MAIN.map((item) => (
              <Link key={item.to} to={item.to}>
                {item.label}
              </Link>
            ))}
          </div>
          <details className="dashboard-nav-more-desktop">
            <summary>More</summary>
            <div className="dashboard-nav-more-desktop-panel" role="menu">
              {DASHBOARD_NAV_DESKTOP_MORE.map((item) => (
                <Link key={item.to} to={item.to} role="menuitem">
                  {item.label}
                </Link>
              ))}
            </div>
          </details>
        </nav>
        <div className="header-account dashboard-nav-right">
          <details className="dashboard-nav-mobile" ref={mobileMenuRef}>
            <summary>Menu</summary>
            <div className="dashboard-nav-mobile-panel" role="menu">
              <div className="dashboard-nav-mobile-account" role="group" aria-label="Account">
                {DASHBOARD_NAV_ACCOUNT_LINKS.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    role="menuitem"
                    className="dashboard-nav-mobile-account-link"
                    onClick={closeMobileMenu}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
              <p className="dashboard-nav-mobile-divider" aria-hidden="true">Workspace</p>
              {DASHBOARD_NAV_LINKS.filter(
                (item) => !DASHBOARD_NAV_ACCOUNT_LINKS.some((account) => account.to === item.to),
              ).map((item) => (
                <Link key={item.to} to={item.to} role="menuitem" onClick={closeMobileMenu}>
                  {item.label}
                </Link>
              ))}
            </div>
          </details>
          <div className="dashboard-user">
            <span>
              {user.avatar ? (
                <img
                  src={user.avatar}
                  alt=""
                  referrerPolicy="no-referrer"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
                />
              ) : (
                user.name?.charAt(0) || user.email.charAt(0)
              )}
            </span>
            <Link to="/settings">
              <small>{user.name || user.email}</small>
            </Link>
            <button type="button" className="dashboard-account-signout" onClick={signOut}>
              Sign out
            </button>
            {onDeleteAccount ? (
              <button type="button" className="dashboard-account-delete" onClick={onDeleteAccount}>
                Delete account
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
