import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api';

function formatStatus(row) {
    if (row.staleObservation && row.status !== 'not_configured') {
        return `${row.status} (stale)`;
    }
    return row.status;
}

function formatPercent(rate) {
    if (rate == null) return '—';
    return `${Math.round(rate * 100)}%`;
}

export default function ProviderHealthPanel() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [probe, setProbe] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const qs = probe ? '?probe=1' : '';
      const res = await apiFetch(`/api/developer/provider-health${qs}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Provider health unavailable');
      setReport(data);
    } catch (err) {
      setError(err.message || 'Could not load provider health');
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [probe]);

  useEffect(() => {
    load();
  }, [load]);

  const rows = report?.providers || [];

  return (
    <section className="model-diagnostics-health" aria-labelledby="provider-health-heading">
      <div className="model-diagnostics-health-head">
        <div>
          <h2 id="provider-health-heading">Provider health monitor</h2>
          <p className="model-diagnostics-lead">
            Live observations from chat traffic and router metrics. Configured API keys alone do not mean operational.
          </p>
        </div>
        <div className="model-diagnostics-health-actions">
          <label className="model-diagnostics-confirm">
            <input
              type="checkbox"
              checked={probe}
              onChange={(e) => setProbe(e.target.checked)}
              disabled={!report?.probesEnabled}
            />
            Run active probe (requires ENABLE_PROVIDER_HEALTH_PROBES=1)
          </label>
          <button type="button" className="model-diagnostics-test-btn" onClick={load} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && <p className="model-diagnostics-error" role="alert">{error}</p>}
      {report?.updatedAt && (
        <p className="model-diagnostics-stripe" role="status">
          Updated {new Date(report.updatedAt).toLocaleString()}
          {report.probeExecuted ? ' · active probes ran' : ''}
        </p>
      )}

      {!loading && rows.length > 0 && (
        <div className="model-diagnostics-table-wrap">
          <table className="model-diagnostics-table">
            <thead>
              <tr>
                <th>Provider</th>
                <th>Status</th>
                <th>Source</th>
                <th>Success rate</th>
                <th>Avg latency</th>
                <th>Last observation</th>
                <th>Recent errors</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const errors = Object.entries(row.recentErrorTypes || {})
                  .map(([k, v]) => `${k} (${v})`)
                  .join(', ');
                return (
                  <tr key={row.id}>
                    <td>{row.id}{row.configured ? '' : ' · not configured'}</td>
                    <td>{formatStatus(row)}</td>
                    <td>{row.statusSource}</td>
                    <td>{formatPercent(row.successRate)}</td>
                    <td>{row.averageLatencyMs != null ? `${row.averageLatencyMs} ms` : '—'}</td>
                    <td>{row.lastObservationAt ? new Date(row.lastObservationAt).toLocaleString() : '—'}</td>
                    <td>{errors || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
