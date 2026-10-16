import './WebSearchProgress.css';
import { WEB_SEARCH_PROGRESS_STAGES as STAGES, webSearchStageIndex as stageIndex } from '../../lib/webSearchUi.js';

function GlobeOrb({ active }) {
  return (
    <span className={`web-search-progress__orb${active ? ' is-active' : ''}`} aria-hidden="true">
      <span className="web-search-progress__orbit" />
      <span className="web-search-progress__globe">🌐</span>
    </span>
  );
}

/**
 * Premium multi-stage search progress — driven only by real backend status events.
 */
export default function WebSearchProgress({
  status = 'searching',
  count = null,
  sources = [],
  label = null,
  error = null,
  onRetry = null,
}) {
  if (status === 'search_unavailable' || error) {
    return (
      <div className="web-search-progress web-search-progress--error" role="alert">
        <p>{error || label || 'Live web search unavailable. Showing an accurate failure instead of inventing results.'}</p>
        {typeof onRetry === 'function' && (
          <button type="button" className="web-search-progress__retry" onClick={onRetry}>
            Retry search
          </button>
        )}
      </div>
    );
  }

  if (status === 'no_sources') {
    return (
      <div className="web-search-progress web-search-progress--empty" role="status">
        <p>No reliable live sources were found for this query.</p>
        {typeof onRetry === 'function' && (
          <button type="button" className="web-search-progress__retry" onClick={onRetry}>
            Retry search
          </button>
        )}
      </div>
    );
  }

  const activeIndex = stageIndex(status);
  const previewSources = Array.isArray(sources) ? sources.slice(0, 4) : [];
  const heading = label
    || (status === 'found' && count != null
      ? `Found ${count} relevant source${count === 1 ? '' : 's'}`
      : STAGES[Math.max(activeIndex, 0)]?.label)
    || 'Searching the Web';

  return (
    <section className="web-search-progress" role="status" aria-live="polite" aria-busy="true">
      <header className="web-search-progress__head">
        <GlobeOrb active={activeIndex <= 0} />
        <div>
          <strong>{heading}</strong>
          <p className="web-search-progress__hint">
            Progress reflects live search events — not estimated percentages.
          </p>
        </div>
      </header>

      <ol className="web-search-progress__timeline">
        {STAGES.map((stage, index) => {
          const done = activeIndex > index;
          const active = activeIndex === index;
          return (
            <li
              key={stage.id}
              className={`web-search-progress__step${done ? ' is-done' : ''}${active ? ' is-active' : ''}`}
            >
              <span className="web-search-progress__step-dot" aria-hidden="true" />
              <span>{stage.label}</span>
            </li>
          );
        })}
      </ol>

      {previewSources.length > 0 && (
        <ul className="web-search-progress__previews" aria-label="Source previews">
          {previewSources.map((source) => (
            <li key={source.url || source.citationId || source.title} className="web-search-progress__preview">
              <span className="web-search-progress__preview-shimmer" aria-hidden="true" />
              <strong>{source.domain || source.title || 'Source'}</strong>
              {source.publishedDate ? <small>Published {source.publishedDate}</small> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

