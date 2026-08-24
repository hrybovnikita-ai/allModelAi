import React, { useEffect, useState } from 'react';
import Login from '../Login/Login';
import './Navbar.css';

export default function Navbar() {
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
          <a href="#home" onClick={closeMenu}>Home</a>
          <a href="#about" onClick={closeMenu}>About</a>
          <a href="#pricing" onClick={closeMenu}>Pricing</a>
          <a href="#models" onClick={closeMenu}>Models</a>
        </div>
        <div className="nav-auth">
          <button className="nav-signin" onClick={() => setAuthMode('signin')}>Sign in</button>
          <button className="nav-signup" onClick={() => setAuthMode('signup')}>Sign up</button>
          <button className="menu-toggle" onClick={() => setMenuOpen((open) => !open)} aria-expanded={menuOpen} aria-label="Toggle navigation menu">
            <span></span><span></span><span></span>
          </button>
        </div>
      </nav>
      {authMode && <Login mode={authMode} onClose={() => setAuthMode(null)} onModeChange={setAuthMode} />}
    </>
  );
}
