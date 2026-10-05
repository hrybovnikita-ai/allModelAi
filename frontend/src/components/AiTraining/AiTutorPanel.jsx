import { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api';

export default function AiTutorPanel({ lesson }) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch('/api/ai-training/tutor/status');
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setUnavailable(!data.available);
      } catch {
        if (!cancelled) setUnavailable(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const ask = async () => {
    const message = question.trim();
    if (!message) return;
    setLoading(true);
    setError('');
    setAnswer('');
    try {
      const res = await apiFetch('/api/ai-training/tutor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          lessonId: lesson?.id,
          lessonContext: lesson,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 503 && data.unavailable) {
        setUnavailable(true);
        setError(data.message || 'AI tutor unavailable');
        return;
      }
      if (!res.ok) {
        setError(data.message || 'Could not reach tutor');
        return;
      }
      setAnswer(data.answer || '');
    } catch (e) {
      setError(e.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="at-card at-tutor" aria-label="AI Tutor">
      <h3>AI Tutor</h3>
      <p className="at-muted">Ask about this lesson — hints and explanations, not automatic exam answers.</p>
      {unavailable && (
        <p className="at-muted">AI tutor unavailable — server needs OPENAI_API_KEY or OpenRouter.</p>
      )}
      <textarea
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="Why does gradient descent need a learning rate?"
        disabled={loading}
      />
      <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
        <button type="button" className="at-btn" onClick={ask} disabled={loading || !question.trim()}>
          {loading ? 'Thinking…' : 'Ask tutor'}
        </button>
      </div>
      {error && <p className="at-error">{error}</p>}
      {answer && <div className="at-tutor-msg">{answer}</div>}
    </section>
  );
}
