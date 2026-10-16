import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../lib/api';
import { readDocument } from '../../lib/readDocument';
import { useLanguage } from '../../lib/useLanguage';
import '../KnowledgeBase/KnowledgeBase.css';

export default function AiFilesPage() {
  const { t } = useLanguage();
  const [files, setFiles] = useState([]);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState([]);
  const [answer, setAnswer] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [renameId, setRenameId] = useState(null);
  const [renameValue, setRenameValue] = useState('');

  const loadFiles = useCallback(async () => {
    const res = await apiFetch(`/api/ai-files${search.trim() ? `?q=${encodeURIComponent(search.trim())}` : ''}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || 'Could not load files');
    setFiles(data.files || []);
  }, [search]);

  useEffect(() => {
    loadFiles().catch((e) => setError(e.message));
  }, [loadFiles]);

  const onUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy('upload');
    setError('');
    try {
      let content = '';
      let pages = null;
      if (/\.(txt|csv|md|markdown)$/i.test(file.name)) {
        content = await file.text();
      } else {
        const doc = await readDocument(file);
        content = doc.content;
        pages = doc.pages;
      }
      const res = await apiFetch('/api/ai-files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: file.name,
          mimeType: file.type || 'text/plain',
          content,
          pages,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Upload failed');
      await loadFiles();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  };

  const onDelete = async (id) => {
    setBusy(id);
    try {
      await apiFetch(`/api/ai-files/${encodeURIComponent(id)}`, { method: 'DELETE' });
      setSelected((current) => current.filter((item) => item !== id));
      await loadFiles();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  };

  const onRename = async (id) => {
    setBusy(`rename-${id}`);
    try {
      const res = await apiFetch(`/api/ai-files/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: renameValue }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Rename failed');
      setRenameId(null);
      await loadFiles();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  };

  const onAsk = async (event) => {
    event.preventDefault();
    if (!query.trim()) return;
    setBusy('ask');
    setError('');
    setAnswer(null);
    try {
      const res = await apiFetch('/api/ai-files/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, fileIds: selected, topK: 6 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Ask failed');
      setAnswer(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  };

  const toggleSelect = (id) => {
    setSelected((current) => (
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    ));
  };

  return (
    <main className="kb-page">
      <header className="kb-header">
        <Link className="kb-brand" to="/dashboard">AllModelAI</Link>
        <nav className="kb-nav">
          <Link to="/knowledge">{t('Knowledge Base')}</Link>
          <Link to="/chat">{t('Chat')}</Link>
        </nav>
      </header>
      <section className="kb-hero">
        <h1>{t('AI Files')}</h1>
        <p>{t('Upload PDF, DOCX, TXT or CSV, then ask grounded questions with citations. Uploaded content is never executed.')}</p>
      </section>

      {error ? <p className="kb-error" role="alert">{error}</p> : null}

      <section className="kb-panel">
        <label className="kb-upload">
          {busy === 'upload' ? t('Uploading…') : t('Upload file')}
          <input type="file" accept=".pdf,.docx,.txt,.csv,.md" onChange={onUpload} disabled={Boolean(busy)} />
        </label>
        <div className="kb-search-row">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('Search files')}
            aria-label={t('Search files')}
          />
        </div>
        {!files.length ? (
          <p className="kb-empty">{t('No files yet. Upload a document to get started.')}</p>
        ) : (
          <ul className="kb-doc-list">
            {files.map((file) => (
              <li key={file.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={selected.includes(file.id)}
                    onChange={() => toggleSelect(file.id)}
                  />
                  {renameId === file.id ? (
                    <>
                      <input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} />
                      <button type="button" onClick={() => onRename(file.id)} disabled={busy}>{t('Save')}</button>
                    </>
                  ) : (
                    <span>{file.name}</span>
                  )}
                </label>
                <span>{file.chunkCount || 0} chunks</span>
                <button type="button" onClick={() => { setRenameId(file.id); setRenameValue(file.name); }}>{t('Rename')}</button>
                <button type="button" onClick={() => onDelete(file.id)} disabled={busy === file.id}>{t('Delete')}</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="kb-panel">
        <form onSubmit={onAsk}>
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('Ask a question about selected files…')}
            rows={3}
          />
          <button type="submit" disabled={busy === 'ask' || !query.trim()}>
            {busy === 'ask' ? t('Thinking…') : t('Ask AI')}
          </button>
        </form>
        {answer ? (
          <div className="kb-answer">
            <p>{answer.text || answer.message}</p>
            {Array.isArray(answer.sources) && answer.sources.length ? (
              <ul>
                {answer.sources.map((source, index) => (
                  <li key={`${source.id || source.documentId}-${index}`}>
                    [{index + 1}] {source.name || source.documentId}: {source.excerpt || source.text || ''}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </section>
    </main>
  );
}
