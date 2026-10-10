import { Link } from 'react-router-dom';
import { useLanguage } from '../../lib/useLanguage';
import { useEffect, useState } from 'react';
import Login from '../Login/Login';
import NavAuthSection from './NavAuthSection';
import { useSession } from '../Session/SessionProvider';
import { AUTH_STATUS } from '../../lib/authSessionStatus';
import { DASHBOARD_NAV_ACCOUNT_LINKS } from '../Dashboard/dashboardNavLinks';
import './Navbar.css';

export default function Navbar() {
  const { t } = useLanguage();
  const { status, user } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const [authMode, setAuthMode] = useState(null);
  const isAuthenticated = status === AUTH_STATUS.AUTHENTICATED && Boolean(user?.email);

  useEffect(() => {
    if (!authMode) return;
    const closeWithEscape = (event) => event.key === 'Escape' && setAuthMode(null);
    document.addEventListener('keydown', closeWithEscape);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', closeWithEscape);
      document.body.style.overflow = '';
    };
  }, [authMode]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onEscape = (event) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', onEscape);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onEscape);
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);

  return (
    <>
      <nav className="navbar" aria-label="Main navigation">
        <a href="#home" className="nav-brand" onClick={closeMenu}>AllModelAI</a>
        <div className={`nav-links ${menuOpen ? 'is-open' : ''}`}>
          {isAuthenticated ? (
            <div className="nav-links-account" role="group" aria-label={t('account')}>
              {DASHBOARD_NAV_ACCOUNT_LINKS.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className="nav-links-account-item"
                  onClick={closeMenu}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          ) : null}
          <a href="#home" onClick={closeMenu}>{t("Home")}</a>
          <a href="#about" onClick={closeMenu}>{t("About")}</a>
          <a href="#pricing" onClick={closeMenu}>{t("Pricing")}</a>
          <a href="#models" onClick={closeMenu}>{t("Models")}</a>
          <Link to="/python-ai" className="nav-link-feature" onClick={closeMenu}>⚡ AI Studio</Link>
        </div>
        <div className="nav-auth">
          <NavAuthSection onOpenAuth={setAuthMode} />
          <button className="menu-toggle" onClick={() => setMenuOpen((open) => !open)} aria-expanded={menuOpen} aria-label="Toggle navigation menu">
            <span></span><span></span><span></span>
          </button>
        </div>
      </nav>
      {authMode && <Login mode={authMode} onClose={() => setAuthMode(null)} onModeChange={setAuthMode} />}
    </>
  );
}
