import { useMemo, useState } from 'react';
import { shouldShowWebSearchCompleted, shouldShowWebSearchUnavailable } from '../../lib/webSearchUi.js';
import { isSafeHttpUrl } from '../../lib/citationLinks.js';
import WebSearchProgress from './WebSearchProgress.jsx';

function faviconUrl(domain) {
  if (!domain) return null;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`;
}

const STAGE_LABELS = {
  searching: '🌐 Searching the web...',
  finding_sources: 'Finding sources…',
  found: 'Found relevant sources',
  reading: '🌐 Reading sources...',
  checking: 'Checking information…',
  analyzing: '🌐 Analyzing information...',
  generating: 'Generating answer…',
  search_unavailable: '🌐 Web search unavailable — using AI knowledge',
  no_sources: '🌐 No strong web sources found — answering from AI knowledge',
  planning: '🔎 Planning research...',
  cross_check: '🔎 Cross-checking information...',
  writing: '🔎 Writing research report...',
};

const PREMIUM_ACTIVE = new Set([
  'searching',
  'finding_sources',
  'found',
  'reading',
  'checking',
  'analyzing',
  'generating',
]);

export function WebSearchStatus({
  status,
  count,
  deepResearch,
  label,
  sources = [],
  error = null,
  onRetry = null,
}) {
  if (!status && !label && !error) return null;

  if (!deepResearch && (PREMIUM_ACTIVE.has(status) || status === 'no_sources' || status === 'search_unavailable' || error)) {
    return (
      <WebSearchProgress
        status={status || 'searching'}
        count={count}
        sources={sources}
        label={label}
        error={error}
        onRetry={onRetry}
      />
    );
  }

  let text = label;
  if (!text) {
    if (status === 'found' && count != null) {
      text = `Found ${count} relevant source${count === 1 ? '' : 's'}`;
    } else {
      text = STAGE_LABELS[status];
    }
  }
  if (!text) return null;
  const active = ['searching', 'finding_sources', 'reading', 'checking', 'analyzing', 'planning', 'cross_check', 'writing', 'generating'].includes(status);
  return (
    <p className={`web-search-status ${deepResearch ? 'deep-research-status' : ''}`} role="status">
      <span className={`web-search-status-icon ${active ? 'active' : ''}`} aria-hidden="true">{deepResearch ? '🔎' : '🌐'}</span>
      {text}
    </p>
  );
}

function formatPublished(value) {
  if (!value) return null;
  const parsed = Date.parse(String(value));
  if (Number.isFinite(parsed)) {
    return new Date(parsed).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }
  return String(value);
}

export default function WebSources({
  sources = [],
  complete = false,
  deepResearch = false,
  unavailable = false,
  retrievedAt = null,
  collapsedLimit = 4,
  onRetry = null,
}) {
  const [expanded, setExpanded] = useState(false);

  const safeSources = useMemo(
    () => (Array.isArray(sources) ? sources.filter((item) => item && (item.url || item.title)) : []),
    [sources],
  );

  if (shouldShowWebSearchUnavailable(unavailable)) {
    return (
      <div className="web-search-unavailable" role="status">
        <p>Web search unavailable — response generated without live web results.</p>
        {typeof onRetry === 'function' && (
          <button type="button" className="web-search-progress__retry" onClick={onRetry}>
            Retry search
          </button>
        )}
      </div>
    );
  }
  if (!safeSources.length) return null;

  const showCompleteHeading = shouldShowWebSearchCompleted(complete, safeSources.length);
  const visible = expanded ? safeSources : safeSources.slice(0, collapsedLimit);
  const hiddenCount = Math.max(0, safeSources.length - collapsedLimit);

  return (
    <section className={`web-sources ${deepResearch ? 'deep-research-sources' : ''}`} aria-label="Sources">
      {showCompleteHeading && (
        <p className="web-sources-heading">{deepResearch ? '🔎 Deep Research complete' : '🌐 Web search completed'}</p>
      )}
      <div className="web-sources-title-row">
        <h4 className="web-sources-title">Sources</h4>
        {retrievedAt && (
          <small className="web-sources-retrieved">
            Retrieved {formatPublished(retrievedAt) || retrievedAt}
          </small>
        )}
      </div>
      <ul className="web-sources-list">
        {visible.map((source) => {
          const citationId = source.citationId ?? source.rank;
          const href = isSafeHttpUrl(source.url) ? source.url : undefined;
          const published = formatPublished(source.publishedDate);
          return (
            <li key={source.url || citationId} id={`web-source-${citationId}`}>
              <a href={href} target="_blank" rel="noopener noreferrer" className="web-source-card">
                <span className="web-source-favicon" aria-hidden="true">
                  {source.domain ? (
                    <img
                      src={faviconUrl(source.domain)}
                      alt=""
                      width="20"
                      height="20"
                      loading="lazy"
                      onError={(event) => { event.currentTarget.style.display = 'none'; }}
                    />
                  ) : '🌐'}
                </span>
                <span className="web-source-meta">
                  <strong>[{citationId}] {source.title || source.domain || 'Source'}</strong>
                  <span className="web-source-title">{source.domain || 'Source'}</span>
                  {published && <small>Published {published}</small>}
                  {!published && source.retrievedAt && (
                    <small>Retrieved {formatPublished(source.retrievedAt)}</small>
                  )}
                </span>
                <span className="web-source-open" aria-hidden="true">Open source ↗</span>
              </a>
            </li>
          );
        })}
      </ul>
      {hiddenCount > 0 && (
        <button
          type="button"
          className="web-sources-expand"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
        >
          {expanded ? 'Show fewer sources' : `Show ${hiddenCount} more source${hiddenCount === 1 ? '' : 's'}`}
        </button>
      )}
    </section>
  );
}
