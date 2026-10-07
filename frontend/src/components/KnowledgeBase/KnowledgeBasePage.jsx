import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../lib/api';
import { readDocument } from '../../lib/readDocument';
import './KnowledgeBase.css';

export default function KnowledgeBasePage() {
  const [documents, setDocuments] = useState([]);
  const [query, setQuery] = useState('');
  const [answer, setAnswer] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const loadDocs = useCallback(async () => {
    const res = await apiFetch('/api/knowledge/documents');
    const data = await res.json().catch(() => ({}));
    if (res.ok) setDocuments(data.documents || []);
  }, []);

  useEffect(() => {
    loadDocs().catch((e) => setError(e.message));
  }, [loadDocs]);

  const onUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy('upload');
    setError('');
    try {
      let payload;
      if (/\.(docx)$/i.test(file.name)) {
        setError('DOCX: paste extracted text or export to PDF/TXT for now.');
        setBusy('');
        return;
      }
      const doc = await readDocument(file);
      payload = {
        name: doc.name,
        mimeType: file.type || 'text/plain',
        content: doc.content,
        pages: doc.pages,
      };
      const res = await apiFetch('/api/knowledge/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Upload failed');
      await loadDocs();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  };

  const onDelete = async (id) => {
    setBusy(id);
    try {
      await apiFetch(`/api/knowledge/documents/${encodeURIComponent(id)}`, { method: 'DELETE' });
      await loadDocs();
      if (answer?.sources?.some((s) => s.documentId === id)) setAnswer(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  };

  const onAsk = async (event) => {
    event.preventDefault();
    const q = query.trim();
    if (!q) return;
    setBusy('query');
    setError('');
    setAnswer(null);
    try {
      const res = await apiFetch('/api/knowledge/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, topK: 6 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Query failed');
      setAnswer(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  };

  return (
    <main className="kb-page">
      <header className="kb-header">
        <Link to="/chat" className="kb-brand">AllModelAI</Link>
        <nav className="kb-nav">
          <Link to="/ai-training">AI Training</Link>
          <Link to="/chat">Chat</Link>
        </nav>
      </header>

      <section className="kb-hero">
        <h1>Knowledge Base</h1>
        <p>Upload documents, index chunks with embeddings, and ask grounded questions with cited sources.</p>
      </section>

      {error && <p className="kb-error" role="alert">{error}</p>}

      <section className="kb-panel">
        <h2>Upload documents</h2>
        <label className="kb-upload">
          <input type="file" accept=".pdf,.txt,.md" disabled={busy === 'upload'} onChange={onUpload} />
          <span>{busy === 'upload' ? 'Processing…' : 'Choose PDF, TXT, or Markdown (max 10 MB)'}</span>
        </label>
      </section>

      <section className="kb-panel">
        <h2>My documents</h2>
        {!documents.length && <p className="kb-muted">No documents yet.</p>}
        <ul className="kb-doc-list">
          {documents.map((doc) => (
            <li key={doc.id}>
              <div>
                <strong>{doc.name}</strong>
                <small>{doc.status} · {doc.chunkCount ?? doc.chunk_count ?? 0} chunks</small>
              </div>
              <button type="button" disabled={busy === doc.id} onClick={() => onDelete(doc.id)}>Delete</button>
            </li>
          ))}
        </ul>
      </section>

      <section className="kb-panel">
        <h2>Ask Knowledge Base</h2>
        <form onSubmit={onAsk} className="kb-ask-form">
          <textarea value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ask about your uploaded notes…" rows={3} />
          <button type="submit" className="kb-primary" disabled={busy === 'query'}>{busy === 'query' ? 'Searching…' : 'Ask'}</button>
        </form>
        {answer && (
          <article className="kb-answer">
            <h3>Answer</h3>
            <p>{answer.text}</p>
            {answer.sources?.length ? (
              <>
                <h4>Sources</h4>
                <ol>
                  {answer.sources.map((s) => (
                    <li key={`${s.documentId}-${s.rank}`}>
                      [{s.rank}] {s.documentName}{s.pageNumber ? ` — page ${s.pageNumber}` : ''}
                    </li>
                  ))}
                </ol>
              </>
            ) : null}
          </article>
        )}
      </section>
    </main>
  );
}
