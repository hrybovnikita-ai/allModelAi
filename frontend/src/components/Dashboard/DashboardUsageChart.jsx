/**
 * Simple horizontal bar chart from /api/analytics byModel (no fabricated data).
 */
export default function DashboardUsageChart({ byModel }) {
  const entries = Object.entries(byModel || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  if (!entries.length) {
    return (
      <p className="dashboard-usage-chart-empty" role="status">
        Model usage appears after your first conversations.
      </p>
    );
  }
  const max = Math.max(...entries.map(([, count]) => count), 1);
  return (
    <div className="dashboard-usage-chart" role="img" aria-label="Usage by AI model">
      <p className="dashboard-eyebrow">Usage by model</p>
      <ul className="dashboard-usage-chart-list">
        {entries.map(([slug, count]) => (
          <li key={slug}>
            <span className="dashboard-usage-chart-label">{slug}</span>
            <span className="dashboard-usage-chart-track" aria-hidden="true">
              <i style={{ width: `${Math.round((count / max) * 100)}%` }} />
            </span>
            <span className="dashboard-usage-chart-value">{count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
