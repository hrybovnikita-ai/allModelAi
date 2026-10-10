import './KnowledgeSourceChips.css';

export default function KnowledgeSourceChips({ sources = [], onSourceClick }) {
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
