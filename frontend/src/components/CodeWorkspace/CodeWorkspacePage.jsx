import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useOutletContext } from 'react-router-dom';
import { apiFetch } from '../../lib/api';
import { FileTypeIcon } from './FileTypeIcon';
import './CodeWorkspace.css';

const ChatCodeBlock = lazy(() => import('../Chat/ChatCodeBlock'));

const DRAFT_KEY = 'allmodelai_workspace_draft_v1';

function readDraftFromStorage() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function persistDraft(project) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(project));
  } catch {
    /* quota */
  }
}

export default function CodeWorkspacePage() {
  const location = useLocation();
  const { user } = useOutletContext() || {};
  const incomingDraft = location.state?.draft;

  const [project, setProject] = useState(() => {
    if (incomingDraft?.name && incomingDraft?.content != null) {
      return {
        id: null,
        name: incomingDraft.name.replace(/\.[^.]+$/, '') || 'Draft',
        files: [{
          id: 'main',
          name: incomingDraft.name,
          language: incomingDraft.language || 'text',
          content: incomingDraft.content,
        }],
        activeFileId: 'main',
      };
    }
    const saved = readDraftFromStorage();
    if (saved?.files?.length) return saved;
    return {
      id: null,
      name: 'Untitled project',
      files: [{ id: 'main', name: 'main.txt', language: 'text', content: '' }],
      activeFileId: 'main',
    };
  });

  const [saveState, setSaveState] = useState('idle');
  const [error, setError] = useState('');

  useEffect(() => {
    persistDraft(project);
  }, [project]);

  const activeFile = useMemo(
    () => project.files.find((file) => file.id === project.activeFileId) || project.files[0],
    [project],
  );

  const updateActiveContent = useCallback((content) => {
    setProject((current) => ({
      ...current,
      files: current.files.map((file) => (
        file.id === current.activeFileId ? { ...file, content } : file
      )),
    }));
    setSaveState('unsaved');
  }, []);

  const saveToBackend = async () => {
    if (!user?.email) return;
    setSaveState('saving');
    setError('');
    try {
      const filePayload = project.files.map(({ name, language, content }) => ({ name, language, content }));
      if (project.id) {
        const res = await apiFetch(`/api/workspace/${encodeURIComponent(project.id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kind: 'code_workspace',
            name: project.name,
            files: filePayload,
          }),
        });
        if (!res.ok) throw new Error('Could not update project');
      } else {
        const res = await apiFetch('/api/workspace', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'project',
            kind: 'code_workspace',
            name: project.name,
            files: filePayload,
          }),
        });
        const created = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(created.message || 'Could not save project');
        setProject((current) => ({ ...current, id: created.id || current.id }));
      }
      setSaveState('saved');
    } catch (err) {
      setSaveState('error');
      setError(err.message || 'Save failed');
    }
  };

  const downloadZipPlaceholder = () => {
    setError('ZIP export for multi-file projects ships with the full Code Workspace (Stage 5). Download individual files from chat code blocks for now.');
  };

  if (!user?.email) return <Navigate to="/login" replace />;

  return (
    <main className="code-workspace-page">
      <header className="code-workspace-header">
        <div>
          <p className="code-workspace-eyebrow">Code Workspace</p>
          <h1>{project.name}</h1>
          <p className="code-workspace-lead">Edit AI-generated code with a focused editor. Saves to your workspace projects when you choose Save.</p>
        </div>
        <div className="code-workspace-header-actions">
          <Link to="/chat" className="code-workspace-link">← Back to chat</Link>
          <button type="button" className="code-workspace-btn" onClick={saveToBackend} disabled={saveState === 'saving'}>
            {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : 'Save project'}
          </button>
          <button type="button" className="code-workspace-btn code-workspace-btn--ghost" onClick={downloadZipPlaceholder}>
            Export ZIP
          </button>
        </div>
      </header>

      {error && <p className="code-workspace-error" role="alert">{error}</p>}
      {saveState === 'unsaved' && <p className="code-workspace-notice" role="status">Unsaved changes (also kept locally until you save to the server).</p>}

      <div className="code-workspace-layout">
        <aside className="code-workspace-explorer" aria-label="Project files">
          <p className="code-workspace-panel-title">Files</p>
          <ul className="code-workspace-file-list">
            {project.files.map((file) => (
              <li key={file.id}>
                <button
                  type="button"
                  className={file.id === project.activeFileId ? 'is-active' : ''}
                  onClick={() => setProject((current) => ({ ...current, activeFileId: file.id }))}
                >
                  <FileTypeIcon filename={file.name} />
                  <span>{file.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section className="code-workspace-editor-panel">
          <div className="code-workspace-tabs" role="tablist">
            {project.files.map((file) => (
              <button
                type="button"
                role="tab"
                aria-selected={file.id === project.activeFileId}
                key={file.id}
                className={file.id === project.activeFileId ? 'is-active' : ''}
                onClick={() => setProject((current) => ({ ...current, activeFileId: file.id }))}
              >
                <FileTypeIcon filename={file.name} />
                <span>{file.name}</span>
                {saveState === 'unsaved' && file.id === project.activeFileId ? <i className="unsaved-dot" aria-label="Unsaved" /> : null}
              </button>
            ))}
          </div>

          <div className="code-workspace-editor-body">
            <textarea
              className="code-workspace-textarea"
              value={activeFile?.content || ''}
              onChange={(event) => updateActiveContent(event.target.value)}
              spellCheck={false}
              aria-label={`Edit ${activeFile?.name || 'file'}`}
            />
            <Suspense fallback={<p className="code-workspace-loading">Loading preview…</p>}>
              <div className="code-workspace-preview-readonly" aria-label="Syntax preview">
                <ChatCodeBlock
                  language={activeFile?.language}
                  filename={activeFile?.name}
                  code={activeFile?.content || ''}
                />
              </div>
            </Suspense>
          </div>
        </section>
      </div>
    </main>
  );
}
