import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import './Settings.css';

export default function Settings() {
  const navigate = useNavigate();
  const saved = sessionStorage.getItem('allmodelai_user');
  const user = saved ? JSON.parse(saved) : null;
  const savedProfile = JSON.parse(localStorage.getItem('allmodelai_profile') || '{}');
  const [profile, setProfile] = useState({ name: savedProfile.name || user?.name || '', avatar: savedProfile.avatar || '', language: savedProfile.language || 'English' });
  const [notice, setNotice] = useState('');
  if (!user) return <Navigate to="/" replace />;

  const saveProfile = (event) => {
    event.preventDefault();
    sessionStorage.setItem('allmodelai_user', JSON.stringify({ ...user, name: profile.name.trim() || user.name }));
    localStorage.setItem('allmodelai_profile', JSON.stringify(profile));
    document.documentElement.lang = profile.language === 'Русский' ? 'ru' : profile.language === 'Українська' ? 'uk' : 'en';
    setNotice('Profile and language preferences saved.');
  };
  const logout = async () => {
    if (!user.guest) await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    sessionStorage.removeItem('allmodelai_user');
    navigate('/');
  };

  return <main className="settings-page"><nav className="settings-nav"><Link to="/dashboard">← Dashboard</Link><strong>AllModelAI settings</strong><Link to="/chat">Open chat</Link></nav><section className="settings-shell">
    <div className="settings-heading"><span>Account</span><h1>Your workspace profile</h1><p>Manage your avatar, identity, language, and account security.</p></div>
    <form className="settings-card" onSubmit={saveProfile}><div className="settings-avatar">{profile.avatar ? <img src={profile.avatar} alt="Profile avatar" /> : (profile.name || user.email).slice(0, 2).toUpperCase()}</div><div className="settings-fields">
      <label>Full name<input value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} /></label>
      <label>Email address<input value={user.email} readOnly /></label>
      <label>Avatar image URL<input value={profile.avatar} onChange={(event) => setProfile({ ...profile, avatar: event.target.value })} placeholder="https://example.com/avatar.jpg" /></label>
      <label>Interface language<select value={profile.language} onChange={(event) => setProfile({ ...profile, language: event.target.value })}>{['English', 'Русский', 'Українська'].map((language) => <option key={language}>{language}</option>)}</select></label>
      <button className="settings-save" type="submit">Save profile</button>
    </div></form>
    <section className="settings-card settings-security"><div><span>Security</span><h2>Keep your account in your control.</h2><p>{user.guest ? 'Guest data stays only in this browser session.' : 'Your session uses a protected HttpOnly cookie. Password recovery is available anytime.'}</p></div><Link className="settings-security-link" to="/forgot-password">Change password</Link></section>
    {notice && <p className="settings-notice" role="status">{notice}</p>}<button className="settings-logout" type="button" onClick={logout}>Sign out of AllModelAI</button>
  </section></main>;
}
