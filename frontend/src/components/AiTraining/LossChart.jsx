import { useMemo } from 'react';

export default function LossChart({ history = [], width = 320, height = 140 }) {
  const points = useMemo(() => {
    if (!history.length) return '';
    const losses = history.map((h) => h.loss);
    const maxLoss = Math.max(...losses, 1e-6);
    const minLoss = Math.min(...losses);
    const span = Math.max(maxLoss - minLoss, 1e-6);
    return history
      .map((row, i) => {
        const x = (i / Math.max(history.length - 1, 1)) * (width - 16) + 8;
        const y = height - 8 - ((row.loss - minLoss) / span) * (height - 16);
        return `${x},${y}`;
      })
      .join(' ');
  }, [history, width, height]);

  if (!history.length) {
    return <p className="at-muted">Run training to see the loss curve.</p>;
  }

  return (
    <svg className="at-loss-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Training loss chart">
      <polyline fill="none" stroke="url(#atLossGrad)" strokeWidth="2.5" points={points} />
      <defs>
        <linearGradient id="atLossGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#a855f7" />
          <stop offset="100%" stopColor="#6366f1" />
        </linearGradient>
      </defs>
    </svg>
  );
}
