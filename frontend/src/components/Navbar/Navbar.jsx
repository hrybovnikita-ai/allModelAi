import { Link } from 'react-router-dom';
import { useLanguage } from '../../lib/useLanguage';
import { useEffect, useState } from 'react';
import Login from '../Login/Login';
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
          <Link to="/python-ai" onClick={closeMenu} style={{ color: '#818cf8', fontWeight: '700' }}>⚡ PyTorch AI</Link>
        </div>
        <div className="nav-auth">
          <button className="nav-signin" onClick={() => setAuthMode('signin')}>{t("Sign in")}</button>
          <button className="nav-signup" onClick={() => setAuthMode('signup')}>{t("Sign up")}</button>
          <button className="menu-toggle" onClick={() => setMenuOpen((open) => !open)} aria-expanded={menuOpen} aria-label="Toggle navigation menu">
            <span></span><span></span><span></span>
          </button>
        </div>
      </nav>
      {authMode && <Login mode={authMode} onClose={() => setAuthMode(null)} onModeChange={setAuthMode} />}
    </>
  );
}
