import { useEffect, useState } from 'react';
import { useOutletContext, Link, Navigate } from 'react-router-dom';
import { LANGUAGES } from '../../lib/languages';
import { useLanguage } from '../../lib/useLanguage';
import LanguageDialog from '../LanguageDialog/LanguageDialog';
import './ChatSettings.css';
import { AllModelAILogoMark } from '../AllModelAILogo/AllModelAILogo';

const colors = [['Blue','#3b82f6'],['Yellow','#facc15'],['Purple','#a855f7'],['Lime','#a3e635'],['Orange','#f97316'],['Red','#ef4444'],['Red orange','#ff4500'],['Violet','#8b5cf6'],['Gray','#9ca3af'],['Green yellow','#adff2f']];
const contrast = (hex) => {
  const channels = [0,2,4].map(index => Number.parseInt(hex.replace('#','').slice(index,index+2),16));
  return (channels[0]*299+channels[1]*587+channels[2]*114)/1000 > 155 ? '#111111' : '#ffffff';
};
export default function ChatSettings() {
  const { user } = useOutletContext();
  const initial = JSON.parse(localStorage.getItem('allmodelai_appearance') || '{}');
  const [theme,setTheme] = useState(initial.theme || 'dark');
  const [color,setColor] = useState(!initial.textColor || initial.textColor.toLowerCase() === '#ffffff' ? '#8b5cf6' : initial.textColor);
  const [inputColor,setInputColor] = useState(initial.inputColor || '#262626');
  const [pendingLang,setPendingLang] = useState(null);
  const { language, setLanguage, t } = useLanguage();

  useEffect(() => {
    const current = JSON.parse(localStorage.getItem('allmodelai_appearance') || '{}');
    localStorage.setItem('allmodelai_appearance', JSON.stringify({...current,theme,textColor:color,inputColor}));
    document.documentElement.dataset.themePreference = theme;
    document.documentElement.dataset.theme = theme === 'auto' ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : theme;
    document.documentElement.style.setProperty('--user-text-color',color);
    document.documentElement.style.setProperty('--user-bubble-text',contrast(color));
    document.documentElement.style.setProperty('--composer-color',inputColor);
    document.documentElement.style.setProperty('--composer-text', '#ffffff');
  }, [theme,color,inputColor]);

  const confirmLanguage = () => { setLanguage(pendingLang); setPendingLang(null); };
  const colorChoices = (items, selected, choose) => <div className="page-color-grid">
    {items.map(([name,value]) => <button type="button" aria-pressed={selected === value} className={selected === value ? 'active' : ''} style={{'--choice':value}} onClick={() => choose(value)} key={name}><i/><span>{t(name)}</span><b aria-hidden="true">{selected === value ? '✓' : ''}</b></button>)}
  </div>;
  if (!user) return <Navigate to="/" replace/>;
  return <main className="chat-settings-page">
    <header><Link to="/chat" className="settings-page-brand"><AllModelAILogoMark />AllModelAI</Link><Link to="/chat" className="back-to-chat">← {t('backChat')}</Link></header>
    <section className="settings-page-hero"><div><span className="settings-page-gear" aria-hidden="true">⚙</span><div><p>{t('personalChat')}</p><h1>{t('settings')}</h1><small>{t('settingsIntro')}</small></div></div><b aria-hidden="true">{t('appearance')}</b></section>
    <div className="settings-page-layout"><section className="settings-options">
      <article><small>03 · {t('language')}</small><h2>{t('language')}</h2><p>{t('confirmText')}</p><div className="page-color-grid language-grid">
        {LANGUAGES.map(item => <button type="button" aria-pressed={language.code === item.code} className={language.code === item.code ? 'active' : ''} onClick={() => { if (language.code !== item.code) setPendingLang(item.name); }} key={item.code}><i className="language-icon" aria-hidden="true">{item.code.slice(0,2).toUpperCase()}</i><span lang={item.code}>{item.native}</span><b aria-hidden="true">{language.code === item.code ? '✓' : ''}</b></button>)}
      </div></article>
      <article><small>{t('inputField')}</small><h2>{t('inputTitle')}</h2><p>{t('inputDescription')}</p>{colorChoices([['Black','#090909'],['Graphite','#262626'],...colors],inputColor,setInputColor)}</article>
      <article><small>01 · {t('appearance')}</small><h2>{t('themeTitle')}</h2><p>{t('themeDescription')}</p><div className="page-theme-grid">
        {[['light','☀','bright'],['dark','●','deepBlack'],['auto','◐','matchDevice']].map(([value,icon,description]) => <button type="button" aria-pressed={theme === value} className={theme === value ? 'active' : ''} onClick={() => setTheme(value)} key={value}><i aria-hidden="true">{icon}</i><span><strong>{t(value)}</strong><small>{t(description)}</small></span><b aria-hidden="true">{theme === value ? '✓' : ''}</b></button>)}
      </div></article>
      <article><small>02 · {t('bubbleTitle')}</small><h2>{t('bubbleTitle')}</h2><p>{t('bubbleDescription')}</p>{colorChoices(colors,color,setColor)}</article>
    </section><aside className="settings-preview"><div><small>{t('liveResult')}</small><h2>{t('previewTitle')}</h2><p>{t('autoSaved')}</p></div><section>
      <div className="preview-ai"><i>AI</i><p>{t('previewHello', {name:user.name?.split(' ')[0] || t('creator')})}</p></div>
      <div className="preview-user"><p style={{backgroundColor:color,color:contrast(color)}}>{t('previewPrompt')}</p></div>
      <div className="preview-composer"><span>{t('messagePlaceholder')}</span><b aria-hidden="true">↑</b></div>
    </section><footer><span><i style={{backgroundColor:color}}/>{t('selected')}</span><strong>{t(colors.find(([,value]) => value === color)?.[0] || 'custom')} · {t(theme)}</strong></footer></aside></div>
    {pendingLang && <LanguageDialog onConfirm={confirmLanguage} onCancel={() => setPendingLang(null)} />}
  </main>;
}
