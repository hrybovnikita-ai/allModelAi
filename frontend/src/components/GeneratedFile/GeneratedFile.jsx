import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { apiFetch } from '../../lib/api';
import { findGeneratedFile, parseGeneratedFile } from '../../lib/generatedFiles';
import './GeneratedFile.css';

export function FileCard({ file, conversationId, temporary = false }) {
  return <Link className="generated-file-card" to={`/files/${encodeURIComponent(conversationId || 'temporary')}/${file.id}`} state={{ file: JSON.stringify({ type: 'allmodelai-file', ...file }), temporary }}>
    <span className="generated-file-icon" aria-hidden="true">{'</>'}</span>
    <span><strong>{file.title}</strong><small>{file.name} &middot; {file.content.split('\n').length} lines</small><em>Open file</em></span><span aria-hidden="true">&rarr;</span>
  </Link>;
}

export default function GeneratedFile() {
  const { conversationId, fileId } = useParams();
  return <FileViewer key={`${conversationId}/${fileId}`} conversationId={conversationId} fileId={fileId} />;
}

function FileViewer({ conversationId, fileId }) {
  const location = useLocation();
  const [result, setResult] = useState(() => {
    if (conversationId !== 'temporary') return { loading: true };
    const file = parseGeneratedFile(location.state?.file);
    return file?.id === fileId ? { file, temporary: true } : { error: 'This temporary file is no longer available. Generate it again in the chat.' };
  });
  const [notice, setNotice] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      if (conversationId === 'temporary') return;
      try {
        const response = await apiFetch('/api/chat/history', { signal: controller.signal });
        if (!response.ok) throw new Error('Could not load the file. Check your connection and sign-in, then retry.');
        const history = await response.json();
        const conversation = history.find(item => item.id === conversationId);
        const file = findGeneratedFile(conversation, fileId);
        if (!file) throw new Error('File not found. It may have been removed from this conversation.');
        setResult({ file });
      } catch (error) {
        if (!controller.signal.aborted) setResult({ error: error.message });
      }
    }
    load();
    return () => controller.abort();
  }, [conversationId, fileId, location.state, attempt]);

  const file = result.file;
  const download = () => {
    const url = URL.createObjectURL(new Blob([file.content], { type: 'text/plain;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = file.name;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <main className="generated-file-page">
    <header><Link to={conversationId === 'temporary' ? '/chat' : `/chat?conversation=${encodeURIComponent(conversationId)}`}>&larr; Back to chat</Link><span>AllModelAI / Files</span></header>
    {result.loading ? <p role="status">Loading file...</p> : result.error ? <section role="alert"><h1>Cannot open file</h1><p>{result.error}</p><button onClick={() => { if (conversationId !== 'temporary') setResult({ loading: true }); setAttempt(value => value + 1); }}>Retry</button></section> : <>
      <section className="generated-file-heading"><div><p>GENERATED FILE</p><h1>{file.title}</h1><span>{file.name}</span></div><div className="generated-file-actions"><button onClick={async () => { try { await navigator.clipboard.writeText(file.content); setNotice('Copied to clipboard.'); } catch { setNotice('Could not copy. Select the text below or download the file.'); } }}>Copy</button><button onClick={download}>Download file</button></div></section>
      {result.temporary && <p className="generated-file-notice">Temporary file: download it before leaving. It is not saved in your account.</p>}
      <p role="status">{notice}</p>
      <section className="generated-file-editor" aria-label="File contents"><div><strong>{file.name}</strong><span>{file.extension.toUpperCase()} &middot; {file.content.split('\n').length} lines</span></div><pre tabIndex="0"><code>{file.content}</code></pre></section>
    </>}
  </main>;
}
