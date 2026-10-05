import { useState } from 'react';
import { apiFetch } from '../../lib/api';

export default function DeepResearchButton({ lesson }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const runResearch = async () => {
    const query = lesson?.deepResearchQuery || `Research ${lesson?.title || 'this ML topic'} authoritative sources`;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await apiFetch('/api/ai-training/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, depth: 'standard' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || 'Research failed');
        return;
      }
      setResult(data);
    } catch (e) {
      setError(e.message || 'Research unavailable');
    } finally {
      setLoading(false);
    }
  };

  const sources = result?.sources || result?.rankedSources || [];

  return (
    <div>
      <button type="button" className="at-btn secondary" onClick={runResearch} disabled={loading}>
        {loading ? 'Researching…' : '🔎 Research this topic'}
      </button>
      {error && <p className="at-error">{error}</p>}
      {(result?.summary || result?.objective) && (
        <div className="at-research-results">
          <p>{result.summary || result.objective}</p>
          {sources.length > 0 && (
            <ul>
              {sources.slice(0, 8).map((src, i) => (
                <li key={src.url || i}>
                  <a href={src.url} target="_blank" rel="noreferrer">
                    {src.title || src.url}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
