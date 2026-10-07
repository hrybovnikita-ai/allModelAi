import './SmartRouterStatus.css';

export default function SmartRouterStatus({ router, routedModel, displayName }) {
  if (!router && !routedModel) return null;
  const task = router?.taskType || 'general';
  const reason = router?.reason || '';
  const fallbacks = router?.fallbacks || [];
  const selected = displayName || router?.selectedModel || routedModel;

  return (
    <aside className="smart-router-status" aria-label="Smart Router">
      <div className="smart-router-status-head">
        <span className="smart-router-badge">Smart Router</span>
      </div>
      <dl className="smart-router-grid">
        <div>
          <dt>Task</dt>
          <dd>{task}</dd>
        </div>
        <div>
          <dt>Selected</dt>
          <dd>{selected}</dd>
        </div>
        {reason ? (
          <div className="smart-router-reason">
            <dt>Reason</dt>
            <dd>{reason}</dd>
          </div>
        ) : null}
        {fallbacks.length ? (
          <div>
            <dt>Fallback</dt>
            <dd>{fallbacks.slice(0, 3).join(' → ')}</dd>
          </div>
        ) : null}
      </dl>
    </aside>
  );
}

export function KnowledgeSourceChips({ sources = [], onSourceClick }) {
  if (!sources?.length) return null;
  return (
    <div className="kb-source-chips" aria-label="Sources">
      <span className="kb-source-label">Sources</span>
      {sources.map((source) => {
        const key = source.chunkId || source.id || source.name;
        const label = [
          source.name,
          source.pageNumber ? `Page ${source.pageNumber}` : source.sectionLabel,
        ].filter(Boolean).join(' · ');
        return (
          <button
            key={key}
            type="button"
            className="kb-source-chip"
            onClick={() => onSourceClick?.(source)}
            title={source.excerpt?.slice(0, 200)}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
