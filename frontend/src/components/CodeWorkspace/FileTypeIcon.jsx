const EXT_ICONS = {
  py: 'PY',
  js: 'JS',
  jsx: 'RX',
  ts: 'TS',
  tsx: 'TX',
  html: 'HT',
  css: 'CS',
  json: 'JS',
  md: 'MD',
  txt: 'TX',
  sql: 'SQ',
  sh: 'SH',
  java: 'JV',
  go: 'GO',
  rs: 'RS',
  png: 'IM',
  jpg: 'IM',
  svg: 'SV',
};

export function FileTypeIcon({ filename, isFolder = false }) {
  if (isFolder) {
    return (
      <span className="file-type-icon file-type-icon--folder" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M3 7a2 2 0 0 1 2-2h5l2 2h9a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      </span>
    );
  }
  const ext = String(filename || '').split('.').pop()?.toLowerCase() || 'file';
  const label = EXT_ICONS[ext] || ext.slice(0, 2).toUpperCase();
  return (
    <span className={`file-type-icon file-type-icon--${ext}`} aria-hidden="true">
      {label}
    </span>
  );
}
