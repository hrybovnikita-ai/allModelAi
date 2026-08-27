import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { apiFetch } from '../../lib/api';
import './PromptGallery.css';

export default function PromptGallery() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const savedUser = sessionStorage.getItem('allmodelai_user');
  const user = savedUser ? JSON.parse(savedUser) : null;

  useEffect(() => {
    if (!user?.email) return;
    apiFetch('/api/prompts')
      .then((response) => response.ok ? response.json() : Promise.reject('Failed to load prompts'))
      .then(setTemplates)
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, [user?.email]);

  const rateTemplate = async (id, direction) => {
    await apiFetch(`/api/prompts/${encodeURIComponent(id)}/rate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ direction }) });
    setTemplates((current) => current.map((item) => item.id === id ? { ...item, rating: Number(item.rating || 0) + (direction === 'down' ? -1 : 1) } : item));
  };

  if (!user) return <Navigate to="/" replace />;

  return (
    <main className="prompt-gallery-page">
      <header className="prompt-gallery-header">
        <Link to="/dashboard" className="prompt-gallery-brand"><span>AI</span>AllModelAI</Link>
        <nav>
          <Link to="/chat">Open chat</Link>
          <Link to="/studio">Studio</Link>
        </nav>
      </header>
      <section className="prompt-gallery-hero">
        <p>TEAM PROMPTS</p>
        <h1>Shared prompt gallery</h1>
        <span>Use ready prompts from your workspace or create reusable templates in Studio → Prompts.</span>
      </section>
      {error && <div className="prompt-gallery-error" role="alert">{error}</div>}
      {loading && <p className="prompt-gallery-status">Loading prompts…</p>}
      {!loading && !templates.length && <p className="prompt-gallery-status">No shared prompts yet. Go to Studio and mark a prompt template as shared.</p>}
      <div className="prompt-gallery-grid">
        {templates.map((item) => (
          <article key={item.id} className="prompt-card">
            <div>
              <h3>{item.name || 'Untitled prompt'}</h3>
              <p>{String(item.content || item.text || '').slice(0, 220)}{(item.content || item.text || '').length > 220 ? '…' : ''}</p>
            </div>
            <div className="prompt-card-footer">
              <span className="prompt-rating">★ {Number(item.rating || 0).toFixed(1)}</span>
              <div className="prompt-card-actions">
                <button onClick={() => rateTemplate(item.id, 'up')} aria-label="Like prompt">👍</button>
                <button onClick={() => rateTemplate(item.id, 'down')} aria-label="Dislike prompt">👎</button>
                <button onClick={() => { localStorage.setItem('allmodelai_prompt_draft', String(item.content || item.text || '').slice(0, 4000)); navigate('/chat?model=smart'); }} className="primary-action">Use prompt</button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}