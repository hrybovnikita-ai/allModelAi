import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import './Settings.css';

export default function Settings() {
  const navigate = useNavigate();
  const saved = sessionStorage.getItem('allmodelai_user');
  const user = saved ? JSON.parse(saved) : null;
  const [notice, setNotice] = useState('');

  if (!user) return <Navigate to="/" replace />;

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    sessionStorage.removeItem('allmodelai_user');
    navigate('/');
  };

  return (
    <main className="settings-page">
      <nav className="settings-nav"><Link to="/dashboard">← Dashboard</Link><strong>AllModelAI settings</strong><Link to="/chat">Open chat</Link></nav>
      <section className="settings-shell">
        <div className="settings-heading"><span>Account</span><h1>Your workspace profile</h1><p>Manage the identity connected to your AllModelAI workspace.</p></div>
        <section className="settings-card">
          <div className="settings-avatar">{(user.name || user.email).slice(0, 2).toUpperCase()}</div>
          <div className="settings-fields"><label>Full name<input value={user.name || ''} readOnly /></label><label>Email address<input value={user.email} readOnly /></label><label>Sign-in method<input value={user.provider || 'Email and password'} readOnly /></label></div>
        </section>
        <section className="settings-card settings-security"><div><span>Security</span><h2>Keep your account in your control.</h2><p>Your remembered session is protected by an HttpOnly cookie and stored securely by the backend.</p></div><button type="button" onClick={() => setNotice('Your session is active and protected.')}>Check session</button></section>
        {notice && <p className="settings-notice" role="status">{notice}</p>}
        <button className="settings-logout" type="button" onClick={logout}>Sign out of AllModelAI</button>
      </section>
    </main>
  );
}
