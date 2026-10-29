import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useOutletContext } from 'react-router-dom';
import { LANGUAGES } from '../../lib/languages';
import { useLanguage } from '../../lib/useLanguage';
import LanguageDialog from '../LanguageDialog/LanguageDialog';
import { DEFAULT_RESPONSE_PREFS, RESPONSE_LANGUAGE_OPTIONS, readResponsePrefs, writeResponsePrefs } from '../../lib/responseLanguagePrefs.js';
import UserMemorySettings from '../Settings/UserMemorySettings';
import './ChatSettings.css';

const SECTIONS = [
  ['profile', 'My Profile'],
  ['general', 'General'],
  ['language', 'Language & Region'],
  ['appearance', 'Appearance'],
  ['colors', 'Text & Colors'],
  ['ai', 'AI Preferences'],
  ['memory', 'AI Memory'],
  ['voice', 'Voice & Audio'],
  ['code', 'Code Assistant'],
  ['privacy', 'Privacy & Security'],
  ['data', 'Data & Storage'],
];

const ACCENTS = [['Violet', '#8b5cf6'], ['Purple', '#7c3aed'], ['Blue', '#3b82f6'], ['Indigo', '#4f46e5'], ['Green', '#22c55e'], ['Red', '#ef4444'], ['Orange', '#f97316']];
const BUBBLES = [['Violet', '#8b5cf6'], ['Blue', '#3b82f6'], ['Indigo', '#4f46e5'], ['Green', '#16a34a'], ['Red', '#dc2626'], ['Orange', '#ea580c']];

const contrast = (hex) => {
  const value = String(hex || '').replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(value)) return '#ffffff';
  const channels = [0, 2, 4].map((index) => Number.parseInt(value.slice(index, index + 2), 16));
  return (channels[0] * 299 + channels[1] * 587 + channels[2] * 114) / 1000 > 155 ? '#111111' : '#ffffff';
};

const readJson = (key, fallback) => {
  try { return { ...fallback, ...JSON.parse(localStorage.getItem(key) || '{}') }; } catch { return fallback; }
};

function SwitchRow({ label, description, checked, onChange }) {
  return (
    <div className="settings-row">
      <div>
        <strong>{label}</strong>
        <p>{description}</p>
      </div>
      <button type="button" role="switch" aria-checked={checked} className={checked ? 'on' : ''} onClick={() => onChange(!checked)}>{checked ? 'On' : 'Off'}</button>
    </div>
  );
}

export default function ChatSettings() {
  const { user } = useOutletContext() || {};
  const { language, setLanguage, t } = useLanguage();
  const [section, setSection] = useState('profile');
  const [query, setQuery] = useState('');
  const [pendingLang, setPendingLang] = useState(null);
  const [saved, setSaved] = useState('');
  const [appearance, setAppearance] = useState(() => readJson('allmodelai_appearance', {
    theme: 'dark', textColor: '#8b5cf6', inputColor: '#262626', aiTextColor: '#ececec', chatBackground: '', accent: '#8b5cf6', density: 'comfortable', reducedMotion: false, fontSize: 16, lineHeight: 1.6, fontFamily: 'inherit', codeTheme: 'dark',
  }));
  const [codeAssist, setCodeAssist] = useState(() => readJson('allmodelai_code_assistant', {
    enabled: true, autoCheck: false, inlineSuggestions: false, explainFixes: true, level: 'beginner', syntaxHighlight: true, lineNumbers: true, wordWrap: true,
  }));
  const [responsePrefs, setResponsePrefs] = useState(() => readResponsePrefs());
  const [region, setRegion] = useState(() => readJson('allmodelai_region', {
    country: '', timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', dateFormat: 'locale', timeFormat: 'locale',
  }));
  const [voice, setVoice] = useState(() => readJson('allmodelai_voice', { voice: 'browser-default', rate: 1, volume: 1, autoRead: false }));
  const [displayName, setDisplayName] = useState(() => localStorage.getItem('allmodelai_display_name') || '');
  const [avatarPreview, setAvatarPreview] = useState(() => localStorage.getItem('allmodelai_avatar') || '');
  const [avatarError, setAvatarError] = useState('');

  const filteredLanguages = useMemo(() => LANGUAGES.filter((item) => `${item.native} ${item.name}`.toLowerCase().includes(query.toLowerCase())), [query]);
  const photo = avatarPreview || user?.photoURL || '';
  const initial = (displayName || user?.name || user?.email || 'A').trim().charAt(0).toUpperCase();

  const appearanceReady = useRef(false);
  useEffect(() => {
    const next = { ...appearance, textColor: appearance.textColor || '#8b5cf6' };
    localStorage.setItem('allmodelai_appearance', JSON.stringify(next));
    const root = document.documentElement;
    root.dataset.themePreference = next.theme || 'dark';
    root.dataset.theme = next.theme === 'auto' ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : (next.theme || 'dark');
    root.dataset.density = next.density || 'comfortable';
    root.dataset.codeTheme = next.codeTheme || 'dark';
    root.style.setProperty('--user-text-color', next.textColor);
    root.style.setProperty('--user-bubble-text', contrast(next.textColor));
    root.style.setProperty('--composer-color', next.inputColor || '#262626');
    root.style.setProperty('--ai-text-color', next.aiTextColor || '#ececec');
    if (next.chatBackground) root.style.setProperty('--chat-canvas', next.chatBackground);
    else root.style.removeProperty('--chat-canvas');
    root.style.setProperty('--chat-line-height', String(next.lineHeight || 1.6));
    root.style.setProperty('--accent', next.accent || '#8b5cf6');
    if (appearanceReady.current) setSaved('Appearance saved on this device');
    appearanceReady.current = true;
  }, [appearance]);

  const updateCodeAssist = (patch) => {
    const next = { ...codeAssist, ...patch };
    setCodeAssist(next);
    localStorage.setItem('allmodelai_code_assistant', JSON.stringify(next));
    setSaved('Saved on this device');
  };

  const setResponseLanguage = (value) => {
    const next = { ...responsePrefs, responseLanguage: value };
    setResponsePrefs(next);
    writeResponsePrefs(next);
    setSaved('Saved on this device');
  };

  const saveRegion = (patch) => {
    const next = { ...region, ...patch };
    setRegion(next);
    localStorage.setItem('allmodelai_region', JSON.stringify(next));
    setSaved('Saved on this device');
  };

  const onAvatar = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 350_000) {
      setAvatarError('Use a JPEG, PNG, or WebP image under 350 KB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result || '');
      setAvatarPreview(value);
      localStorage.setItem('allmodelai_avatar', value);
      setAvatarError('');
      setSaved('Avatar saved on this device');
    };
    reader.readAsDataURL(file);
  };

  if (!user) return <Navigate to="/" replace />;

  return (
    <main className="chat-settings-page settings-shell">
      <header className="settings-top">
        <div>
          <h1>{t('settings')}</h1>
          <p>Personalize your AllModelAI workspace</p>
        </div>
        <Link to="/chat" className="back-to-chat">← {t('backChat')}</Link>
        <span className="settings-save">{saved}</span>
      </header>
      <div className="settings-frame">
        <nav className="settings-nav" aria-label="Settings categories">
          <span>NAVIGATION</span>
          {SECTIONS.map(([id, label]) => (
            <button key={id} type="button" className={section === id ? 'active' : ''} aria-current={section === id ? 'page' : undefined} onClick={() => setSection(id)}>{label}</button>
          ))}
        </nav>
        <section className="settings-panel">
          {section === 'profile' && (
            <>
              <h1>My Profile</h1>
              <div className="profile-card">
                {photo ? <img src={photo} alt="" className="profile-avatar" /> : <span className="profile-avatar">{initial}</span>}
                <div>
                  <strong>{displayName || user.name || user.email}</strong>
                  <p>{user.email}</p>
                  <p>{user.provider || 'Firebase'} · {user.plan || user.subscription || 'Current plan'}</p>
                </div>
              </div>
              <label>Display name<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
              {avatarError ? <p className="settings-error">{avatarError}</p> : null}
              <div className="settings-actions">
                <button type="button" className="file-trigger" onClick={() => document.getElementById('avatar-file').click()}>Change photo</button>
                <input id="avatar-file" className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={onAvatar} />
                <button type="button" onClick={() => { localStorage.removeItem('allmodelai_avatar'); setAvatarPreview(''); setSaved('Avatar removed on this device'); }}>Remove photo</button>
                <button type="button" onClick={() => { localStorage.removeItem('allmodelai_avatar'); setAvatarPreview(user.photoURL || ''); setSaved('Profile photo restored'); }}>Restore profile photo</button>
                <button type="button" onClick={() => { localStorage.setItem('allmodelai_display_name', displayName.trim()); setSaved('Display name saved'); }}>Save changes</button>
              </div>
            </>
          )}
          {section === 'general' && (
            <>
              <h1>General</h1>
              <p>Account preferences stay on this signed-in browser profile. Billing country and currency are not changed here.</p>
              <p>Created {user.createdAt ? new Date(user.createdAt).toLocaleDateString(undefined, { timeZone: region.timeZone }) : 'date unavailable'}</p>
            </>
          )}
          {section === 'language' && (
            <>
              <h1>{t('language')}</h1>
              <p>{t('confirmText')}</p>
              <label>Interface language
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search languages" />
              </label>
              <select aria-label="Interface language" value={language.code} onChange={(event) => { const item = LANGUAGES.find((row) => row.code === event.target.value); if (item && item.code !== language.code) setPendingLang(item.name); }}>
                {filteredLanguages.map((item) => <option key={item.code} value={item.code}>{item.native}</option>)}
              </select>
              <h2>AI response language</h2>
              <p>Auto-detect follows your latest message. This does not change the website language.</p>
              <select aria-label="AI response language" value={responsePrefs.responseLanguage || 'auto'} onChange={(event) => setResponseLanguage(event.target.value)}>
                {RESPONSE_LANGUAGE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <label>Time zone<input value={region.timeZone} onChange={(event) => saveRegion({ timeZone: event.target.value })} /></label>
              <label>Date format
                <select value={region.dateFormat} onChange={(event) => saveRegion({ dateFormat: event.target.value })}>
                  <option value="locale">Regional default</option>
                  <option value="ymd">YYYY-MM-DD</option>
                  <option value="dmy">DD.MM.YYYY</option>
                </select>
              </label>
            </>
          )}
          {section === 'appearance' && (
            <>
              <h1>{t('themeTitle')}</h1>
              <div className="choice-row">
                {[['dark', 'Dark'], ['light', 'Light'], ['auto', 'System']].map(([value, label]) => (
                  <button type="button" key={value} className={appearance.theme === value ? 'active' : ''} onClick={() => setAppearance((current) => ({ ...current, theme: value }))}>{label}</button>
                ))}
              </div>
              <h2>Accent</h2>
              <div className="swatches">
                {ACCENTS.map(([name, value]) => <button type="button" key={value} style={{ background: value }} aria-label={name} className={appearance.accent === value ? 'active' : ''} onClick={() => setAppearance((current) => ({ ...current, accent: value }))} />)}
              </div>
              <label>Density
                <select value={appearance.density} onChange={(event) => setAppearance((current) => ({ ...current, density: event.target.value }))}>
                  <option value="comfortable">Comfortable</option>
                  <option value="compact">Compact</option>
                </select>
              </label>
              <SwitchRow label="Reduced animations" description="Limits motion in the interface." checked={Boolean(appearance.reducedMotion)} onChange={(value) => setAppearance((current) => ({ ...current, reducedMotion: value }))} />
              <button type="button" onClick={() => { if (window.confirm('Reset appearance and colors on this device? Chat history stays unchanged.')) setAppearance({ theme: 'dark', textColor: '#8b5cf6', inputColor: '#262626', aiTextColor: '#ececec', chatBackground: '', accent: '#8b5cf6', density: 'comfortable', reducedMotion: false, fontSize: 16, lineHeight: 1.6, fontFamily: 'inherit', codeTheme: 'dark' }); }}>Reset appearance</button>
            </>
          )}
          {section === 'colors' && (
            <>
              <h1>Text & Colors</h1>
              <label>Your bubble<input type="color" value={appearance.textColor || '#8b5cf6'} onChange={(event) => setAppearance((current) => ({ ...current, textColor: event.target.value }))} /></label>
              <div className="swatches">{BUBBLES.map(([name, value]) => <button type="button" key={value} style={{ background: value }} aria-label={name} onClick={() => setAppearance((current) => ({ ...current, textColor: value }))} />)}</div>
              <label>AI text<input type="color" value={appearance.aiTextColor || '#ececec'} onChange={(event) => setAppearance((current) => ({ ...current, aiTextColor: event.target.value }))} /></label>
              <label>Chat background<input type="color" value={appearance.chatBackground || '#212121'} onChange={(event) => setAppearance((current) => ({ ...current, chatBackground: event.target.value }))} /></label>
              <label>Font size<input type="range" min="14" max="20" value={appearance.fontSize || 16} onChange={(event) => setAppearance((current) => ({ ...current, fontSize: Number(event.target.value) }))} /></label>
              <label>Line spacing<input type="range" min="1.3" max="2" step="0.1" value={appearance.lineHeight || 1.6} onChange={(event) => setAppearance((current) => ({ ...current, lineHeight: Number(event.target.value) }))} /></label>
              <label>Code theme
                <select value={appearance.codeTheme || 'dark'} onChange={(event) => setAppearance((current) => ({ ...current, codeTheme: event.target.value }))}>
                  <option value="dark">Dark</option>
                  <option value="light">Light</option>
                </select>
              </label>
            </>
          )}
          {section === 'ai' && (
            <>
              <h1>AI Preferences</h1>
              <p>Smart Router and Anonin stay available. These choices do not change your subscription.</p>
              <label>Response length
                <select value={responsePrefs.length || DEFAULT_RESPONSE_PREFS.length} onChange={(event) => { const next = { ...responsePrefs, length: event.target.value }; setResponsePrefs(next); writeResponsePrefs(next); }}>
                  <option value="brief">Brief</option>
                  <option value="balanced">Balanced</option>
                  <option value="detailed">Detailed</option>
                </select>
              </label>
              <label>Preferred response language
                <select value={responsePrefs.responseLanguage || 'auto'} onChange={(event) => setResponseLanguage(event.target.value)}>
                  {RESPONSE_LANGUAGE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
            </>
          )}
          {section === 'memory' && <><h1>AI Memory</h1><p>Removing a memory entry does not delete chat history.</p><UserMemorySettings /></>}
          {section === 'voice' && (
            <>
              <h1>Voice & Audio</h1>
              <p>Uses the browser speech voice when one is available. No extra voices are installed by this page.</p>
              <label>Speech speed<input type="range" min="0.7" max="1.4" step="0.1" value={voice.rate} onChange={(event) => { const next = { ...voice, rate: Number(event.target.value) }; setVoice(next); localStorage.setItem('allmodelai_voice', JSON.stringify(next)); }} /></label>
              <SwitchRow label="Auto-read responses" description="Asks the browser to speak new replies when speech synthesis is available." checked={voice.autoRead} onChange={(value) => { const next = { ...voice, autoRead: value }; setVoice(next); localStorage.setItem('allmodelai_voice', JSON.stringify(next)); }} />
            </>
          )}
          {section === 'code' && (
            <>
              <h1>Code assistant</h1>
              <p>Suggestions stay separate from your original code until you apply them.</p>
              <SwitchRow label="Enable Code Assistant" description="Turns the assistant on for code messages." checked={codeAssist.enabled} onChange={(value) => updateCodeAssist({ enabled: value })} />
              <SwitchRow label="Check code automatically" description="Runs static checks when a code message is sent." checked={codeAssist.autoCheck} onChange={(value) => updateCodeAssist({ autoCheck: value })} />
              <SwitchRow label="Inline suggestions" description="Shows suggestions while you edit." checked={codeAssist.inlineSuggestions} onChange={(value) => updateCodeAssist({ inlineSuggestions: value })} />
              <SwitchRow label="Explain corrections" description="Adds a short explanation with each suggestion." checked={codeAssist.explainFixes} onChange={(value) => updateCodeAssist({ explainFixes: value })} />
              <SwitchRow label="Syntax highlighting" description="Keeps colored code blocks." checked={codeAssist.syntaxHighlight !== false} onChange={(value) => updateCodeAssist({ syntaxHighlight: value })} />
              <SwitchRow label="Line numbers" description="Shows line numbers in code blocks." checked={codeAssist.lineNumbers !== false} onChange={(value) => updateCodeAssist({ lineNumbers: value })} />
              <SwitchRow label="Word wrapping" description="Wraps long code lines." checked={codeAssist.wordWrap !== false} onChange={(value) => updateCodeAssist({ wordWrap: value })} />
              <label>Explanation level
                <select value={codeAssist.level} onChange={(event) => updateCodeAssist({ level: event.target.value })}>
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                </select>
              </label>
            </>
          )}
          {section === 'privacy' && (
            <>
              <h1>Privacy & Security</h1>
              <p>Signed in with {user.provider || 'Firebase'}. Passwords and tokens are not shown here.</p>
              <Link className="text-link" to="/settings">Account security, export, and deletion</Link>
            </>
          )}
          {section === 'data' && (
            <>
              <h1>Data & Storage</h1>
              <p>Appearance, language, and code-assistant choices are stored in this browser. Chat history remains in your account.</p>
            </>
          )}
        </section>
        <aside className="settings-preview">
          <h2>{t('previewTitle')}</h2>
          <p>{t('autoSaved')}</p>
          <div className="preview-stage" style={{ background: appearance.chatBackground || '#111118', fontSize: `${appearance.fontSize || 16}px`, lineHeight: appearance.lineHeight || 1.6 }}>
            <div className="preview-ai"><p style={{ color: appearance.aiTextColor || '#ececec' }}>{t('previewHello')}</p><pre className={appearance.codeTheme === 'light' ? 'light' : ''}>print("hello")</pre></div>
            <div className="preview-user"><p style={{ background: appearance.textColor, color: contrast(appearance.textColor) }}>{t('previewPrompt')}</p></div>
            <div className="preview-composer"><span>{t('messagePlaceholder')}</span><b>↑</b></div>
          </div>
        </aside>
      </div>
      {pendingLang && <LanguageDialog onConfirm={() => { setLanguage(pendingLang); setPendingLang(null); }} onCancel={() => setPendingLang(null)} />}
    </main>
  );
}
