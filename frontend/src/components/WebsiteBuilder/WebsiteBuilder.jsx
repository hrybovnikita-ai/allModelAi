import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useOutletContext } from 'react-router-dom';
import { apiFetch, checkChatResponse } from '../../lib/api';
import { extractApplication, readGenerationStream } from '../../lib/appGeneration';
import {
  DEFAULT_PAGE,
  buildPreviewDocument,
  downloadProject,
  editorLabel,
  fileIcon,
  listProjectFiles,
  normalizeProject,
  resolvePreviewPage,
  starterProject,
} from '../../lib/websiteProject';
import ImageGenerator from '../ImageGenerator/ImageGenerator';
import { AllModelAILogoMark } from '../AllModelAILogo/AllModelAILogo';
import './WebsiteBuilder.css';

const STORAGE_KEY = 'allmodelai_website_files';

const readSavedFiles = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return normalizeProject(saved);
  } catch {
    return starterProject();
  }
};

export default function WebsiteBuilder() {
  const { user } = useOutletContext() || {};
  const [files, setFiles] = useState(readSavedFiles);
  const projectFiles = useMemo(() => listProjectFiles(files), [files]);
  const [activeFile, setActiveFile] = useState(DEFAULT_PAGE);
  const [previewNav, setPreviewNav] = useState({ page: DEFAULT_PAGE, history: [DEFAULT_PAGE], index: 0 });
  const previewPage = previewNav.page;
  const previewHistory = previewNav.history;
  const previewHistoryIndex = previewNav.index;
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState('Saved locally');
  const request = useRef(null);
  const previewPageRef = useRef(previewPage);
  const filesRef = useRef(files);

  useEffect(() => { previewPageRef.current = previewNav.page; }, [previewNav.page]);
  useEffect(() => { filesRef.current = files; }, [files]);
  useEffect(() => () => request.current?.abort(), []);

  const saveFiles = (next) => {
    const normalized = normalizeProject(next);
    setFiles(normalized);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
      setSaveStatus('Saved locally');
    } catch {
      setSaveStatus('Not saved — download your app');
    }
  };

  const [error, setError] = useState('');
  const [previewKey, setPreviewKey] = useState(0);
  const [viewport, setViewport] = useState('desktop');

  const preview = useMemo(
    () => buildPreviewDocument(files, previewPage),
    [files, previewPage],
  );

  const bumpPreview = useCallback(() => setPreviewKey((key) => key + 1), []);

  const navigatePreview = useCallback((href, { pushHistory = true } = {}) => {
    const resolved = resolvePreviewPage(href, previewPageRef.current, filesRef.current);
    if (!resolved) return;
    setPreviewNav((current) => {
      if (!pushHistory) return { ...current, page: resolved.page };
      const trimmed = current.history.slice(0, current.index + 1);
      if (trimmed[trimmed.length - 1] !== resolved.page) trimmed.push(resolved.page);
      return { page: resolved.page, history: trimmed, index: trimmed.length - 1 };
    });
    bumpPreview();
  }, [bumpPreview]);

  useEffect(() => {
    const handler = (event) => {
      if (event.data?.type !== 'allmodelai-preview-nav') return;
      navigatePreview(event.data.href);
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [navigatePreview]);

  const selectedFile = projectFiles.includes(activeFile) ? activeFile : (projectFiles[0] || DEFAULT_PAGE);

  if (!user) return <Navigate to="/" replace />;

  const selectFile = (name) => {
    setActiveFile(name);
    if (name.endsWith('.html')) {
      setPreviewNav({ page: name, history: [name], index: 0 });
      bumpPreview();
    }
  };

  const updateFile = (value) => {
    saveFiles({ ...files, [selectedFile]: value });
  };

  const previewBack = () => {
    if (previewHistoryIndex <= 0) return;
    setPreviewNav((current) => {
      const index = current.index - 1;
      return { ...current, index, page: current.history[index] };
    });
    bumpPreview();
  };

  const previewForward = () => {
    if (previewHistoryIndex >= previewHistory.length - 1) return;
    setPreviewNav((current) => {
      const index = current.index + 1;
      return { ...current, index, page: current.history[index] };
    });
    bumpPreview();
  };

  const generateWebsite = async () => {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      const controller = new AbortController();
      request.current = controller;
      const response = await apiFetch('/api/apps/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
        signal: controller.signal,
      });
      await checkChatResponse(response);
      const answer = await readGenerationStream(response);
      const next = extractApplication(answer);
      saveFiles(next);
      const home = listProjectFiles(next).find((name) => name.endsWith('.html')) || DEFAULT_PAGE;
      setActiveFile(home);
      setPreviewNav({ page: home, history: [home], index: 0 });
      bumpPreview();
    } catch (requestError) {
      if (requestError.name !== 'AbortError') setError(requestError.message || 'Could not generate the application.');
    } finally {
      setBusy(false);
    }
  };

  return <main className="website-builder">
    <header className="builder-header">
      <Link to="/dashboard" className="builder-brand"><AllModelAILogoMark />AllModelAI</Link>
      <div className="builder-title"><strong>App Builder</strong><small>{saveStatus}</small></div>
      <nav><button type="button" onClick={() => setImageOpen(true)}>✦ Create image</button><Link to="/chat">Chat</Link><Link to="/studio">Studio</Link><button type="button" onClick={() => downloadProject(files)}>Download</button></nav>
    </header>

    <section className="builder-prompt">
      <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Describe your app: to-do list, calculator, quiz…" aria-label="Application description" maxLength={4000} disabled={busy} rows="2" />
      <button type="button" disabled={!prompt.trim() || busy} onClick={generateWebsite}>{busy ? 'Creating app…' : 'Create app'}</button>
      <small className="builder-help">Multi-page websites · Live preview navigation · Editor · Download ZIP</small>
      {busy && <p role="status">AI is writing your app code…</p>}
      {error && <p role="alert">{error}</p>}
    </section>

    <div className="builder-workspace">
      <section className="builder-editor">
        <div className="builder-file-panel">
          <p className="builder-file-heading">FILES</p>
          <div className="builder-file-list" role="tablist" aria-label="Project files">
            {projectFiles.map((name) => (
              <button
                type="button"
                role="tab"
                aria-selected={selectedFile === name}
                className={selectedFile === name ? 'active' : ''}
                onClick={() => selectFile(name)}
                key={name}
              >
                <span className="builder-file-icon" aria-hidden="true">{fileIcon(name)}</span>
                <span>{name}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="editor-filebar"><span>{editorLabel(selectedFile)}</span><small>{(files[selectedFile] || '').split('\n').length} lines</small></div>
        <textarea className="code-editor" disabled={busy} value={files[selectedFile] || ''} onChange={(event) => updateFile(event.target.value)} spellCheck="false" aria-label={`${selectedFile} code`} />
      </section>

      <section className="builder-preview">
        <header>
          <strong>Live Preview</strong>
          <span className="preview-page-label">{previewPage}</span>
          <div className="preview-nav">
            <button type="button" onClick={previewBack} disabled={previewHistoryIndex <= 0} aria-label="Back" title="Back">←</button>
            <button type="button" onClick={previewForward} disabled={previewHistoryIndex >= previewHistory.length - 1} aria-label="Forward" title="Forward">→</button>
            <button type="button" onClick={bumpPreview} aria-label="Refresh preview" title="Refresh preview">↻</button>
          </div>
          <div className="viewport-switcher">{['desktop', 'tablet', 'mobile'].map((size) => <button type="button" className={viewport === size ? 'active' : ''} onClick={() => setViewport(size)} aria-label={`${size} preview`} title={`${size} preview`} key={size}>{size === 'desktop' ? '▰' : size === 'tablet' ? '▯' : '▯'}</button>)}</div>
        </header>
        <div className={`preview-stage ${viewport}`}><iframe key={`${previewKey}-${previewPage}`} title="Generated website preview" sandbox="allow-scripts" srcDoc={preview} /></div>
      </section>
    </div>
    {imageOpen && <ImageGenerator onClose={() => setImageOpen(false)} />}
  </main>;
}
