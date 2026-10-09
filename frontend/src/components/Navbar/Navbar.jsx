import { Link } from 'react-router-dom';
import { useLanguage } from '../../lib/useLanguage';
import { useEffect, useState } from 'react';
import Login from '../Login/Login';
import NavAuthSection from './NavAuthSection';
import './Navbar.css';

export default function Navbar() {
  const { t } = useLanguage();
  const [menuOpen, setMenuOpen] = useState(false);
  const [authMode, setAuthMode] = useState(null);

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

  const closeMenu = () => setMenuOpen(false);

  return (
    <>
      <nav className="navbar" aria-label="Main navigation">
        <a href="#home" className="nav-brand" onClick={closeMenu}>AllModelAI</a>
        <div className={`nav-links ${menuOpen ? 'is-open' : ''}`}>
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
