export default function RegressionPlot({
  scatter = [],
  lineBefore = [],
  lineAfter = [],
  width = 360,
  height = 200,
}) {
  if (!scatter.length) {
    return <p className="at-muted">No data yet.</p>;
  }

  const xs = scatter.map((p) => p.x);
  const ys = scatter.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys, ...(lineAfter || []).map((p) => p.y));
  const maxY = Math.max(...ys, ...(lineAfter || []).map((p) => p.y));
  const pad = 12;
  const sx = (x) => pad + ((x - minX) / Math.max(maxX - minX, 1e-6)) * (width - pad * 2);
  const sy = (y) => height - pad - ((y - minY) / Math.max(maxY - minY, 1e-6)) * (height - pad * 2);

  const line = (pts, stroke, dash) => {
    if (!pts || pts.length < 2) return null;
    return (
      <line
        x1={sx(pts[0].x)}
        y1={sy(pts[0].y)}
        x2={sx(pts[1].x)}
        y2={sy(pts[1].y)}
        stroke={stroke}
        strokeWidth="2"
        strokeDasharray={dash}
      />
    );
  };

  return (
    <svg className="at-regression-plot" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Regression scatter and lines">
      {line(lineBefore, 'rgba(148,163,184,0.9)', '6 4')}
      {line(lineAfter, '#a855f7', undefined)}
      {scatter.map((p, i) => (
        <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r="3.5" fill="#818cf8" opacity="0.85" />
      ))}
    </svg>
  );
}
