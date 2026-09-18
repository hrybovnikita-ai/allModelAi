import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useOutletContext } from 'react-router-dom';
import { apiFetch, checkChatResponse } from '../../lib/api';
import { extractApplication, readGenerationStream } from '../../lib/appGeneration';
import ImageGenerator from '../ImageGenerator/ImageGenerator';
import './WebsiteBuilder.css';

const starterFiles = {
  html: '<main class="hero">\n  <nav><strong>Nova</strong><a href="#features">Features</a></nav>\n  <section>\n    <p class="eyebrow">BUILT WITH ALLMODEL AI</p>\n    <h1>Turn an idea into a working website.</h1>\n    <p class="intro">Describe your website, generate the files, and refine every detail in the live editor.</p>\n    <button id="action">Start building</button>\n  </section>\n</main>',
  css: '* { box-sizing: border-box; }\nbody { margin: 0; font-family: Inter, system-ui, sans-serif; background: #f4f5f7; color: #15171a; }\n.hero { min-height: 100vh; padding: 28px clamp(24px, 6vw, 90px); background: linear-gradient(135deg, #ffffff 0 55%, #dcefe8 55%); }\nnav { display: flex; justify-content: space-between; align-items: center; }\nnav a { color: inherit; text-decoration: none; }\nsection { max-width: 720px; padding-top: 18vh; }\n.eyebrow { color: #087f5b; font-size: 12px; font-weight: 800; letter-spacing: 1.2px; }\nh1 { max-width: 680px; margin: 12px 0 18px; font-size: clamp(42px, 7vw, 82px); line-height: .98; }\n.intro { max-width: 560px; color: #565d66; font-size: 18px; line-height: 1.65; }\nbutton { margin-top: 20px; padding: 13px 18px; border: 0; background: #15171a; color: white; font: inherit; font-weight: 700; cursor: pointer; }',
  js: "document.querySelector('#action')?.addEventListener('click', () => {\n  document.querySelector('#action').textContent = 'Website is live';\n});",
};

const readSavedFiles = () => {
  try { const saved = JSON.parse(localStorage.getItem('allmodelai_website_files')); return saved && ['html', 'css', 'js'].every(key => typeof saved[key] === 'string') ? saved : starterFiles; }
  catch { return starterFiles; }
};

export default function WebsiteBuilder() {
  const { user } = useOutletContext() || {};
  const [files, setFiles] = useState(readSavedFiles);
  const [activeFile, setActiveFile] = useState('html');
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState('Saved locally');
  const request = useRef(null);
  useEffect(() => () => request.current?.abort(), []);
  const saveFiles = (next) => {
    setFiles(next);
    try { localStorage.setItem('allmodelai_website_files', JSON.stringify(next)); setSaveStatus('Saved locally'); }
    catch { setSaveStatus('Not saved — download your app'); }
  };
  const [error, setError] = useState('');
  const [previewKey, setPreviewKey] = useState(0);
  const [viewport, setViewport] = useState('desktop');

  const preview = useMemo(() => `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; script-src &#39;unsafe-inline&#39;; style-src &#39;unsafe-inline&#39;; img-src data: blob:; connect-src &#39;none&#39;; form-action &#39;none&#39;; base-uri &#39;none&#39;"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${files.css}</style></head><body>${files.html}<script>${files.js}</script></body></html>`, [files]);
  if (!user) return <Navigate to="/" replace />;

  const updateFile = (value) => {
    const next = { ...files, [activeFile]: value };
    saveFiles(next);
  };

  const generateWebsite = async () => {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      const controller = new AbortController();
      request.current = controller;
      const response = await apiFetch('/api/apps/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }), signal: controller.signal });
      await checkChatResponse(response);
      const answer = await readGenerationStream(response);
      const next = extractApplication(answer);
      saveFiles(next);
      setPreviewKey((key) => key + 1);
    } catch (requestError) {
      if (requestError.name !== 'AbortError') setError(requestError.message || 'Could not generate the application.');
    } finally {
      setBusy(false);
    }
  };

  const download = () => {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([preview], { type: 'text/html' }));
    link.download = 'allmodelai-app.html';
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  };

  return <main className="website-builder">
    <header className="builder-header">
      <Link to="/dashboard" className="builder-brand"><span>AI</span>AllModelAI</Link>
      <div className="builder-title"><strong>App Builder</strong><small>{saveStatus}</small></div>
      <nav><button type="button" onClick={() => setImageOpen(true)}>✦ Create image</button><Link to="/chat">Chat</Link><Link to="/studio">Studio</Link><button type="button" onClick={download}>Download</button></nav>
    </header>

    <section className="builder-prompt">
      <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Опиши приложение: список задач, калькулятор, викторина…" aria-label="Application description" maxLength={4000} disabled={busy} rows="2" />
      <button type="button" disabled={!prompt.trim() || busy} onClick={generateWebsite}>{busy ? 'Создаём приложение…' : 'Create app'}</button>
      <small className="builder-help">Интерактивное браузерное приложение · Предпросмотр · Редактор · Скачать HTML</small>
      {busy && <p role="status">ИИ пишет код приложения…</p>}
      {error && <p role="alert">{error}</p>}
    </section>

    <div className="builder-workspace">
      <section className="builder-editor">
        <div className="file-tabs" role="tablist">
          {['html', 'css', 'js'].map((file) => <button type="button" role="tab" aria-selected={activeFile === file} className={activeFile === file ? 'active' : ''} onClick={() => setActiveFile(file)} key={file}><i />{file === 'js' ? 'JavaScript' : file.toUpperCase()}</button>)}
        </div>
        <div className="editor-filebar"><span>{activeFile === 'js' ? 'script.js' : activeFile === 'css' ? 'styles.css' : 'index.html'}</span><small>{files[activeFile].split('\n').length} lines</small></div>
        <textarea className="code-editor" disabled={busy} value={files[activeFile]} onChange={(event) => updateFile(event.target.value)} spellCheck="false" aria-label={`${activeFile} code`} />
      </section>

      <section className="builder-preview">
        <header><strong>Live Preview</strong><div className="viewport-switcher">{['desktop', 'tablet', 'mobile'].map((size) => <button type="button" className={viewport === size ? 'active' : ''} onClick={() => setViewport(size)} aria-label={`${size} preview`} title={`${size} preview`} key={size}>{size === 'desktop' ? '▰' : size === 'tablet' ? '▯' : '▯'}</button>)}</div><button type="button" onClick={() => setPreviewKey((key) => key + 1)} aria-label="Refresh preview" title="Refresh preview">↻</button></header>
        <div className={`preview-stage ${viewport}`}><iframe key={previewKey} title="Generated website preview" sandbox="allow-scripts" srcDoc={preview} /></div>
      </section>
    </div>
    {imageOpen && <ImageGenerator onClose={() => setImageOpen(false)} />}
  </main>;
}
