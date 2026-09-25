function faviconUrl(domain) {
  if (!domain) return null;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`;
}

const STAGE_LABELS = {
  searching: '🌐 Searching the web...',
  found: 'Found relevant sources',
  reading: '🌐 Reading sources...',
  analyzing: '🌐 Analyzing information...',
  search_unavailable: '🌐 Web search unavailable — using AI knowledge',
  no_sources: '🌐 No strong web sources found — answering from AI knowledge',
  planning: '🔎 Planning research...',
  cross_check: '🔎 Cross-checking information...',
  writing: '🔎 Writing research report...',
};

export function WebSearchStatus({ status, count, deepResearch, label }) {
  if (!status && !label) return null;
  let text = label;
  if (!text) {
    if (status === 'found' && count != null) {
      text = `Found ${count} relevant source${count === 1 ? '' : 's'}`;
    } else {
      text = STAGE_LABELS[status];
    }
  }
  if (!text) return null;
  const active = ['searching', 'reading', 'analyzing', 'planning', 'cross_check', 'writing'].includes(status);
  return (
    <p className={`web-search-status ${deepResearch ? 'deep-research-status' : ''}`} role="status">
      <span className={`web-search-status-icon ${active ? 'active' : ''}`} aria-hidden="true">{deepResearch ? '🔎' : '🌐'}</span>
      {text}
    </p>
  );
}

export default function WebSources({ sources = [], complete = false, deepResearch = false }) {
  if (!sources.length) return null;
  return (
    <section className={`web-sources ${deepResearch ? 'deep-research-sources' : ''}`} aria-label="Sources">
      {complete && (
        <p className="web-sources-heading">{deepResearch ? '🔎 Deep Research complete' : '🌐 Web search completed'}</p>
      )}
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
                <strong>{source.title || source.domain || 'Source'}</strong>
                <span className="web-source-title">{source.domain || 'Source'}</span>
                {source.publishedDate && <small>{source.publishedDate}</small>}
              </span>
              <span className="web-source-open" aria-hidden="true">Open source ↗</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
