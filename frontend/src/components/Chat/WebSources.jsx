function faviconUrl(domain) {
  if (!domain) return null;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`;
}

export function WebSearchStatus({ status, count }) {
  if (!status) return null;
  const labels = {
    searching: '🌐 Searching the web...',
    found: count != null ? `Found ${count} relevant source${count === 1 ? '' : 's'}` : 'Found relevant sources',
    reading: '🌐 Reading sources...',
    analyzing: '🌐 Analyzing information...',
    search_unavailable: '🌐 Web search unavailable — using AI knowledge',
    no_sources: '🌐 No strong web sources found — answering from AI knowledge',
  };
  const label = labels[status];
  if (!label) return null;
  return (
    <p className="web-search-status" role="status">
      <span className={`web-search-status-icon ${status === 'searching' || status === 'reading' || status === 'analyzing' ? 'active' : ''}`} aria-hidden="true">🌐</span>
      {label}
    </p>
  );
}

export default function WebSources({ sources = [], complete = false }) {
  if (!sources.length) return null;
  return (
    <section className="web-sources" aria-label="Sources">
      {complete && <p className="web-sources-heading">🌐 Web search completed</p>}
      <h4 className="web-sources-title">Sources</h4>
      <ul className="web-sources-list">
        {sources.map((source) => (
          <li key={source.url || source.rank}>
            <a href={source.url} target="_blank" rel="noopener noreferrer" className="web-source-card">
              <span className="web-source-favicon" aria-hidden="true">
                {source.domain ? (
                  <img src={faviconUrl(source.domain)} alt="" width="20" height="20" loading="lazy" onError={(event) => { event.currentTarget.style.display = 'none'; }} />
                ) : '🌐'}
              </span>
              <span className="web-source-meta">
                <strong>{source.domain || 'Source'}</strong>
                <span className="web-source-title">{source.title}</span>
                {source.domain && <small>{source.domain}</small>}
              </span>
              <span className="web-source-open" aria-hidden="true">↗</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
