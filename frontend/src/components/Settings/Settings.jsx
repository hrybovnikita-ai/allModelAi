import SocialConnections from './SocialConnections';
import AccountSecurity from './AccountSecurity.jsx';
import { useEffect, useState } from 'react';
import { performLogout } from '../../lib/session';
import { useOutletContext, Link, Navigate, useNavigate } from 'react-router-dom';
import { useSession } from '../Session/SessionProvider';
import { LANGUAGES } from '../../lib/languages';
import { useLanguage } from '../../lib/useLanguage';
import {
  DEFAULT_RESPONSE_PREFS,
  RESPONSE_LANGUAGE_OPTIONS,
  persistResponseLanguagePreference,
  readResponsePrefs,
} from '../../lib/responseLanguagePrefs';
import { createStorageIdea, fetchStorageIdea } from '../../lib/storageIdeas';
import UserMemorySettings from './UserMemorySettings';
import './Settings.css';

export default function Settings() {
  const navigate = useNavigate();
  const { language: selectedLanguage, setLanguage, t } = useLanguage();
  const outletContext = useOutletContext();
  const { user: sessionUser } = useSession();
  const user = outletContext?.user?.email ? outletContext.user : sessionUser;
  const savedProfile = JSON.parse(localStorage.getItem('allmodelai_profile') || '{}');
  const [profile, setProfile] = useState({ name: savedProfile.name || user?.name || '', avatar: savedProfile.avatar || user?.avatar || '', language: selectedLanguage.name });
  const [notice, setNotice] = useState('');
  const [pendingLanguage, setPendingLanguage] = useState(null);
  const [responseLanguage, setResponseLanguage] = useState(
    () => readResponsePrefs().responseLanguage || DEFAULT_RESPONSE_PREFS.responseLanguage,
  );
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const remote = await fetchStorageIdea('chat-settings');
        if (!active || !remote?.responseLanguage) return;
        setResponseLanguage(remote.responseLanguage);
        await persistResponseLanguagePreference(remote.responseLanguage);
      } catch {
        /* offline or unsigned — local prefs only */
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    const hash = typeof window !== 'undefined' ? window.location.hash : '';
    if (!hash) return undefined;
    const target = document.querySelector(hash);
    if (!target) return undefined;
    const timer = window.setTimeout(() => {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
    return () => window.clearTimeout(timer);
  }, []);

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

  const saveProfile = async (event) => {
    event.preventDefault();
    localStorage.setItem('allmodelai_profile', JSON.stringify({
      ...profile,
      language: selectedLanguage.name,
      responseLanguage,
    }));
    try {
      await persistResponseLanguagePreference(responseLanguage, {
        syncChatSettings: (body) => createStorageIdea('chat-settings', body),
      });
    } catch {
      await persistResponseLanguagePreference(responseLanguage);
    }
    setNotice('notice');
  };
  const logout = async () => {
    const result = await performLogout();
    if (result.warning) {
      setNotice(result.warning);
    }
    navigate('/', { replace: true });
  };

  return <main className="settings-page"><nav className="settings-nav" aria-label={t('settings')}><Link to="/dashboard">← {t('Dashboard')}</Link><strong>AllModelAI · {t('settings')}</strong><Link to="/chat">{t('Open chat')}</Link></nav><section className="settings-shell">
    <div className="settings-heading"><span>{t('account')}</span><h1>{t('heading')}</h1><p>{t('subtitle')}</p></div>
    <nav className="settings-section-nav" aria-label="Settings sections">
      <Link to="#settings-profile">{t('account')}</Link>
      <Link to="#settings-security">{t('security')}</Link>
      <Link to="#ai-memory">AI memory</Link>
    </nav>
    <form id="settings-profile" className="settings-card settings-card-profile" onSubmit={saveProfile}><div className="settings-avatar">{profile.avatar ? <img src={profile.avatar} alt="Profile avatar" /> : (profile.name || user.email).slice(0, 2).toUpperCase()}</div><div className="settings-fields">
      <label>{t('fullName')}<input value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} /></label>
      <label>{t('email')}<input value={user.email} readOnly /></label>
      <label>{t('avatar')}<input value={profile.avatar} onChange={(event) => setProfile({ ...profile, avatar: event.target.value })} placeholder="https://example.com/avatar.jpg" /></label>
      <label>{t('language')}<select value={selectedLanguage.name} onChange={changeLanguage}>{LANGUAGES.map((language) => <option key={language.name} value={language.name}>{language.native}</option>)}</select></label>
      <label>AI response language<select value={responseLanguage} onChange={(event) => setResponseLanguage(event.target.value)}>{RESPONSE_LANGUAGE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      <p className="settings-field-hint">Auto-detect follows your message text. Explicit instructions in chat still override this setting.</p>
      <button className="settings-save" type="submit">{t('save')}</button>
    </div></form>
    <AccountSecurity />
    <UserMemorySettings />
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
