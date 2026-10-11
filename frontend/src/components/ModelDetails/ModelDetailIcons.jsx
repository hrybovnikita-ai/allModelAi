const icons = {
  programming: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M8 8 4 12l4 4M16 8l4 4-4 4M14 5l-4 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  reasoning: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3a6 6 0 0 0-3.6 10.8L12 21l3.6-7.2A6 6 0 0 0 12 3Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  ),
  translation: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 8h8M9 4v4M5 16h6M14 8h5l-2 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  documents: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M8 4h8l2 2v14H6V4h2Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M10 11h6M10 15h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ),
  research: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="6" stroke="currentColor" strokeWidth="1.8" />
      <path d="M16 16 21 21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ),
  vision: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  ),
  writing: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 20h16M7 16l9-9 3 3-9 9H7v-3Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  ),
  summaries: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6h12M6 12h8M6 18h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ),
  streaming: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12h3l2-4 3 8 2-4h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  tools: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M14 6a3 3 0 1 0-4 4L4 20l2 2 8-6a3 3 0 0 0 4-4l-4-4Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  ),
  general: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3v18M3 12h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ),
};

export function ModelDetailIcon({ name, className = '' }) {
  return (
    <span className={`model-detail-icon ${className}`.trim()}>
      {icons[name] || icons.general}
    </span>
  );
}
