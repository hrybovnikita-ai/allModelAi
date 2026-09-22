import SocialConnections from './SocialConnections';
import { useState } from 'react';
import { clearAllSessionData } from '../../lib/session';
import { apiFetch } from '../../lib/api';
import { useOutletContext, Link, Navigate, useNavigate } from 'react-router-dom';
import { LANGUAGES } from '../../lib/languages';
import { useLanguage } from '../../lib/useLanguage';
import './Settings.css';

export default function Settings() {
  const navigate = useNavigate();
  const { language: selectedLanguage, setLanguage, t } = useLanguage();
  const { user } = useOutletContext();
  const savedProfile = JSON.parse(localStorage.getItem('allmodelai_profile') || '{}');
  const [profile, setProfile] = useState({ name: savedProfile.name || user?.name || '', avatar: savedProfile.avatar || user?.avatar || '', language: selectedLanguage.name });
  const [notice, setNotice] = useState('');
  const [pendingLanguage, setPendingLanguage] = useState(null);
  if (!user) return <Navigate to="/" replace />;


  const changeLanguage = (event) => {
    const language = event.target.value;
    if (language === selectedLanguage.name) return;
    setPendingLanguage(language);
  };

  const confirmLanguage = () => {
    const language = pendingLanguage;
    setPendingLanguage(null);
    if (!language) return;
    const nextProfile = { ...profile, language };
    setProfile(nextProfile);
    localStorage.setItem('allmodelai_profile', JSON.stringify(nextProfile));
    setLanguage(language);
    setNotice('notice');
  };

  const cancelLanguage = () => {
    // "No": keep the previous language — the select snaps back to the saved value.
    setPendingLanguage(null);
    setNotice('');
  };

  const saveProfile = (event) => {
    event.preventDefault();
    localStorage.setItem('allmodelai_profile', JSON.stringify({ ...profile, language: selectedLanguage.name }));
    setNotice('notice');
  };
  const logout = async () => {
    try {
      const response = await apiFetch('/api/auth/logout', { method: 'POST' });
      if (!response.ok) throw new Error('Could not sign out. Please retry.');
      clearAllSessionData();
      navigate('/login', { replace: true });
    } catch (error) {
      setNotice(error.message);
    }
  };

  return <main className="settings-page"><nav className="settings-nav"><Link to="/dashboard">← {t('Dashboard')}</Link><strong>AllModelAI ? {t('settings')}</strong><Link to="/chat">{t('Open chat')}</Link></nav><section className="settings-shell">
    <div className="settings-heading"><span>{t('account')}</span><h1>{t('heading')}</h1><p>{t('subtitle')}</p></div>
    <form className="settings-card" onSubmit={saveProfile}><div className="settings-avatar">{profile.avatar ? <img src={profile.avatar} alt="Profile avatar" /> : (profile.name || user.email).slice(0, 2).toUpperCase()}</div><div className="settings-fields">
      <label>{t('fullName')}<input value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} /></label>
      <label>{t('email')}<input value={user.email} readOnly /></label>
      <label>{t('avatar')}<input value={profile.avatar} onChange={(event) => setProfile({ ...profile, avatar: event.target.value })} placeholder="https://example.com/avatar.jpg" /></label>
      <label>{t('language')}<select value={selectedLanguage.name} onChange={changeLanguage}>{LANGUAGES.map((language) => <option key={language.name} value={language.name}>{language.native}</option>)}</select></label>
      <button className="settings-save" type="submit">{t('save')}</button>
    </div></form>
    <section className="settings-card settings-security"><div><span>{t('security')}</span><h2>{t('securityHeading')}</h2></div><Link className="settings-security-link" to="/forgot-password">{t('changePassword')}</Link></section>
    <SocialConnections />
    {notice && <p className="settings-notice" role="status">{t(notice)}</p>}<button className="settings-logout" type="button" onClick={logout}>{t('logout')}</button>
  </section>
    {pendingLanguage && <div className="settings-modal-backdrop" onClick={cancelLanguage}>
      <section className="settings-modal" role="alertdialog" aria-modal="true" aria-labelledby="language-confirm-title" onClick={(event) => event.stopPropagation()}>
        <span className="settings-modal-icon">🌐</span>
        <h2 id="language-confirm-title">{t('confirmTitle')}</h2>
        <p className="settings-modal-text">{t('confirmText')}</p>
        <div className="settings-modal-actions">
          <button type="button" className="settings-modal-no" onClick={cancelLanguage}>{t('no')}</button>
          <button type="button" className="settings-modal-yes" onClick={confirmLanguage}>{t('yes')}</button>
        </div>
      </section>
    </div>}
  </main>;
}
