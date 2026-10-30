import SocialConnections from './SocialConnections';
import AccountSecurity from './AccountSecurity.jsx';
import SettingsGeneralPanel from './SettingsGeneralPanel.jsx';
import SettingsBillingPanel from './SettingsBillingPanel.jsx';
import SettingsPrivacyPanel from './SettingsPrivacyPanel.jsx';
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
import { getLanguageRevision, persistUiLanguage, sanitizeStoredLanguagePreferences } from '../../lib/languagePreference';
import RouteErrorBoundary from '../ErrorBoundary/RouteErrorBoundary.jsx';
import { createStorageIdea, fetchStorageIdea } from '../../lib/storageIdeas';
import { updateAccountProfile } from '../../lib/accountSecurity.js';
import UserMemorySettings from './UserMemorySettings';
import AiStickerSettings from './AiStickerSettings';
import DeveloperModeSettings from './DeveloperModeSettings';
import PlatformRoadmapPanel from './PlatformRoadmapPanel';
import './Settings.css';

function SettingsPage() {
  const navigate = useNavigate();
  const { language: selectedLanguage, setLanguage, t } = useLanguage();
  const outletContext = useOutletContext();
  const { user: sessionUser, refresh } = useSession();
  const user = outletContext?.user?.email ? outletContext.user : sessionUser;
  const savedProfile = (() => {
    try {
      return JSON.parse(localStorage.getItem('allmodelai_profile') || '{}') || {};
    } catch {
      return {};
    }
  })();
  const [profile, setProfile] = useState({
    name: savedProfile.name || user?.name || '',
    avatar: savedProfile.avatar || user?.avatar || '',
    language: selectedLanguage.name,
  });
  const [notice, setNotice] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const [languageStatus, setLanguageStatus] = useState('');
  const [responseLanguage, setResponseLanguage] = useState(
    () => readResponsePrefs().responseLanguage || DEFAULT_RESPONSE_PREFS.responseLanguage,
  );

  useEffect(() => {
    if (!user) return;
    setProfile((current) => ({
      ...current,
      name: current.name || user.name || '',
      avatar: current.avatar || user.avatar || '',
    }));
  }, [user]);

  useEffect(() => {
    if (!user?.email) return undefined;
    let active = true;
    (async () => {
      try {
        const remote = await fetchStorageIdea('chat-settings');
        if (!active || !remote) return;
        if (remote.responseLanguage) {
          setResponseLanguage(remote.responseLanguage);
        }
      } catch {
        /* offline — local prefs only */
      }
    })();
    return () => {
      active = false;
    };
  }, [user?.email]);

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

  if (!user) return <Navigate to="/login" replace />;

  const changeLanguage = (event) => {
    const language = event.target.value;
    if (language === selectedLanguage.name) return;
    let revision;
    try {
      ({ revision } = setLanguage(language));
    } catch (languageError) {
      console.error('[AllModelAI] Language change failed', languageError);
      setLanguageStatus('Could not apply that language. Try again or reset in Try again recovery.');
      return;
    }
    setProfile((current) => ({ ...current, language }));
    setLanguageStatus('Saving language…');
    setSaveError('');
    void persistUiLanguage(language, revision)
      .then((result) => {
        if (getLanguageRevision() !== revision) return;
        if (result?.skipped) return;
        setLanguageStatus(`${language} saved for this account.`);
      })
      .catch(() => {
        if (getLanguageRevision() !== revision) return;
        setLanguageStatus(`${language} is saved on this device. Account sync failed.`);
      });
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    setSaveError('');
    setNotice('');
    setSaving(true);
    try {
      const result = await updateAccountProfile({
        name: profile.name,
        avatar: profile.avatar,
      });
      const nextProfile = {
        ...profile,
        name: result?.user?.name || profile.name,
        avatar: result?.user?.avatar || profile.avatar || '',
        language: selectedLanguage.name,
        responseLanguage,
      };
      setProfile(nextProfile);
      localStorage.setItem('allmodelai_profile', JSON.stringify(nextProfile));
      try {
        await persistResponseLanguagePreference(responseLanguage, {
          syncChatSettings: (body) => createStorageIdea('chat-settings', body),
        });
      } catch {
        await persistResponseLanguagePreference(responseLanguage);
      }
      await refresh?.({ force: true });
      setNotice('notice');
    } catch (error) {
      setSaveError(error.message || 'Could not save your profile.');
    } finally {
      setSaving(false);
    }
  };

  const logout = async () => {
    const result = await performLogout();
    if (result.warning) {
      setNotice(result.warning);
    }
    navigate('/', { replace: true });
  };

  return (
    <main className="settings-page">
      <nav className="settings-nav" aria-label={t('settings')}>
        <Link to="/dashboard">← {t('Dashboard')}</Link>
        <strong>AllModelAI · {t('settings')}</strong>
        <Link to="/chat">{t('Open chat')}</Link>
      </nav>
      <section className="settings-shell">
        <div className="settings-heading">
          <span>{t('account')}</span>
          <h1>{t('heading')}</h1>
          <p>{t('subtitle')}</p>
        </div>
        <nav className="settings-section-nav" aria-label="Settings sections">
          <Link to="#settings-general">General</Link>
          <Link to="#settings-profile">{t('account')}</Link>
          <Link to="#settings-security">{t('security')}</Link>
          <Link to="#settings-ai">AI preferences</Link>
          <Link to="#settings-billing">Billing</Link>
          <Link to="#settings-privacy">Privacy</Link>
        </nav>

        <SettingsGeneralPanel
          selectedLanguage={selectedLanguage.name}
          languages={LANGUAGES}
          onLanguageChange={changeLanguage}
          languageStatus={languageStatus}
          responseLanguage={responseLanguage}
          responseLanguageOptions={RESPONSE_LANGUAGE_OPTIONS}
          onResponseLanguageChange={(event) => setResponseLanguage(event.target.value)}
        />

        <form id="settings-profile" className="settings-card settings-card-profile" onSubmit={saveProfile}>
          <div className="settings-avatar">
            {profile.avatar
              ? <img src={profile.avatar} alt="Profile avatar" />
              : (profile.name || user.email).slice(0, 2).toUpperCase()}
          </div>
          <div className="settings-fields">
            <span className="settings-card-kicker">{t('account')}</span>
            <h2>Profile</h2>
            <label>
              {t('fullName')}
              <input
                value={profile.name}
                onChange={(event) => setProfile({ ...profile, name: event.target.value })}
                autoComplete="name"
              />
            </label>
            <label>
              {t('email')}
              <input value={user.email} readOnly />
            </label>
            <p className="settings-field-hint">Verified email for this account. Sign-in identity cannot be changed here.</p>
            <label>
              {t('avatar')}
              <input
                value={profile.avatar}
                onChange={(event) => setProfile({ ...profile, avatar: event.target.value })}
                placeholder="https://example.com/avatar.jpg"
              />
            </label>
            {saveError ? <p className="settings-password-error" role="alert">{saveError}</p> : null}
            <button className="settings-save" type="submit" disabled={saving}>
              {saving ? 'Saving…' : t('save')}
            </button>
          </div>
        </form>

        <AccountSecurity />

        <section id="settings-ai" className="settings-ai-group" aria-label="AI preferences">
          <DeveloperModeSettings />
          <PlatformRoadmapPanel />
          <AiStickerSettings />
          <UserMemorySettings />
          <div className="settings-card">
            <div>
              <span>AI</span>
              <h2>Model & chat preferences</h2>
              <p className="settings-security-hint">
                Default models, Smart Router, streaming, and provider options live in chat settings.
              </p>
            </div>
            <div className="settings-password-actions">
              <Link className="settings-save" to="/chat/settings">Open chat settings</Link>
              <Link className="settings-security-link" to="/chat?model=smart">Smart Router chat</Link>
              <Link className="settings-security-link" to="/provider-health">Provider health</Link>
            </div>
          </div>
        </section>

        <SettingsBillingPanel />
        <SettingsPrivacyPanel />
        <SocialConnections />

        {notice && <p className="settings-notice" role="status">{t(notice)}</p>}
        <button className="settings-logout" type="button" onClick={logout}>{t('logout')}</button>
      </section>

    </main>
  );
}

export default function Settings() {
  return (
    <RouteErrorBoundary recoverFromError={() => sanitizeStoredLanguagePreferences()}>
      <SettingsPage />
    </RouteErrorBoundary>
  );
}
