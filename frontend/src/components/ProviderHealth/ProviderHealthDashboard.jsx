import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../lib/api';
import {
  STATUS_FILTERS,
  WINDOW_OPTIONS,
  filterProvidersClient,
  sortProvidersClient,
  statusBadgeClass,
  formatPercent,
  chartSeriesFromPoints,
} from '../../lib/providerHealthDashboard';
import './ProviderHealthDashboard.css';

const POLL_MS = 45_000;

function MetricChart({ history = [], label = 'Metric', color = '#818cf8' }) {
  if (!history.length) {
    return <p className="provider-health-empty-chart">No data for this window yet.</p>;
  }
  const w = 360;
  const h = 140;
  const max = Math.max(...history, 1e-9);
  const min = Math.min(...history);
  const range = Math.max(max - min, 1e-9);
  const points = history
    .map((v, i) => {
      const x = (i / Math.max(history.length - 1, 1)) * (w - 8) + 4;
      const y = h - 6 - ((v - min) / range) * (h - 12);
      return `${x},${y}`;
    })
    .join(' ');
  const gridY = [0.25, 0.5, 0.75].map((t) => h - 6 - t * (h - 12));
  return (
    <div className="mlab-chart-wrap">
      <small>{label}</small>
      <svg className="mlab-chart" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label}>
        {gridY.map((y) => (
          <line key={y} className="mlab-chart-grid" x1={4} x2={w - 4} y1={y} y2={y} />
        ))}
        <polyline
          className="mlab-chart-line"
          fill="none"
          stroke={color}
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={points}
        />
      </svg>
    </div>
  );
}

function SummaryCards({ summary }) {
  if (!summary) return null;
  const items = [
    { label: 'Configured', value: summary.configuredProviders ?? '—' },
    { label: 'Operational', value: summary.operationalProviders ?? '—' },
    { label: 'Degraded', value: summary.degradedProviders ?? '—' },
    { label: 'Unavailable', value: summary.unavailableProviders ?? '—' },
    { label: 'Rate limited', value: summary.rateLimitedProviders ?? '—' },
    {
      label: 'Avg latency',
      value: summary.averageLatencyMs != null ? `${summary.averageLatencyMs} ms` : '—',
    },
    { label: 'Success rate', value: formatPercent(summary.overallSuccessRate) },
  ];
  return (
    <div className="provider-health-summary-grid" aria-label="Health summary">
      {items.map((item) => (
        <div key={item.label} className="provider-health-summary-card">
          <small>{item.label}</small>
          <strong>{item.value}</strong>
        </div>
      ))}
    </div>
  );
}

export default function ProviderHealthDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [windowKey, setWindowKey] = useState('1h');
  const [expanded, setExpanded] = useState({});
  const abortRef = useRef(null);

  const load = useCallback(async (silent = false) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    if (!silent) setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams({
        window: windowKey,
        includeModels: '1',
        includeCharts: '1',
      });
      const res = await apiFetch(`/api/health/providers?${qs}`, { signal: controller.signal });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || 'Could not load provider health');
      setData(body);
    } catch (err) {
      if (err.name === 'AbortError') return;
      setError(err.message || 'Could not load provider health');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [windowKey]);

  useEffect(() => {
    load(false);
    const timer = setInterval(() => load(true), POLL_MS);
    return () => {
      clearInterval(timer);
      abortRef.current?.abort();
    };
  }, [load]);

  const modelsByProvider = useMemo(() => {
    const map = {};
    for (const m of data?.models || []) {
      const pid = m.providerId;
      if (!map[pid]) map[pid] = [];
      map[pid].push(m);
    }
    return map;
  }, [data?.models]);

  const visibleProviders = useMemo(() => {
    let list = filterProvidersClient(data?.providers, { statusFilter, search });
    list = sortProvidersClient(list, sortBy);
    return list;
  }, [data?.providers, statusFilter, search, sortBy]);

  const charts = data?.charts || {};
  const successSeries = chartSeriesFromPoints(charts.successRateOverTime, 'successRate').map((v) => v * 100);
  const latencySeries = chartSeriesFromPoints(charts.latencyOverTime, 'avgLatencyMs');
  const errorEntries = Object.entries(charts.errorsByCategory || {}).sort((a, b) => b[1] - a[1]);

  const toggleExpanded = (id) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <main className="dashboard-page dashboard-violet provider-health-page">
      <header className="provider-health-head">
        <div>
          <p className="provider-health-eyebrow">Platform status</p>
          <h1>AI Provider Health Monitor</h1>
          <p className="provider-health-lead">
            Operational status from real chat and router traffic. Refreshes about every 45 seconds while this page is open.
          </p>
        </div>
        <Link to="/dashboard" className="provider-health-back">
          ← Dashboard
        </Link>
      </header>

      <div className="provider-health-toolbar">
        <select
          aria-label="Time window"
          value={windowKey}
          onChange={(e) => setWindowKey(e.target.value)}
        >
          {WINDOW_OPTIONS.map((w) => (
            <option key={w.id} value={w.id}>
              {w.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          {STATUS_FILTERS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
        <select aria-label="Sort providers" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          <option value="name">Sort by name</option>
          <option value="latency">Sort by latency</option>
          <option value="success">Sort by success rate</option>
        </select>
        <input
          type="search"
          placeholder="Search provider or model"
          aria-label="Search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button type="button" onClick={() => load(false)} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh now'}
        </button>
      </div>

      {data?.updatedAt && (
        <p className="provider-health-stripe" role="status">
          Last updated {new Date(data.updatedAt).toLocaleString()}
          {data.window ? ` · window ${data.window}` : ''}
        </p>
      )}

      {error && (
        <p className="provider-health-error" role="alert">
          {error}
        </p>
      )}

      {loading && !data && (
        <div className="provider-health-cards" aria-busy="true">
          {[1, 2, 3].map((n) => (
            <div key={n} className="provider-health-skeleton" />
          ))}
        </div>
      )}

      {data && (
        <>
          <SummaryCards summary={data.summary} />

          <section className="provider-health-charts" aria-label="Health charts">
            <div className="provider-health-chart-card">
              <h3>Success rate over time</h3>
              <MetricChart history={successSeries} label="Success rate (%)" color="#34d399" />
            </div>
            <div className="provider-health-chart-card">
              <h3>Average latency</h3>
              <MetricChart history={latencySeries} label="Latency (ms)" color="#818cf8" />
            </div>
            <div className="provider-health-chart-card">
              <h3>Errors by category</h3>
              {errorEntries.length === 0 ? (
                <p className="provider-health-empty-chart">No classified errors in this window.</p>
              ) : (
                <ul className="provider-health-errors-list">
                  {errorEntries.map(([cat, count]) => (
                    <li key={cat}>
                      <span>{cat.replace(/_/g, ' ')}</span>
                      <span>{count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className="provider-health-cards" aria-label="Providers">
            {visibleProviders.length === 0 && (
              <p className="provider-health-empty-chart">No providers match your filters.</p>
            )}
            {visibleProviders.map((provider) => {
              const open = Boolean(expanded[provider.id]);
              const models = modelsByProvider[provider.id] || [];
              return (
                <article key={provider.id} className="provider-health-card">
                  <button
                    type="button"
                    className="provider-health-card-head"
                    aria-expanded={open}
                    onClick={() => toggleExpanded(provider.id)}
                  >
                    <div className="provider-health-card-title">
                      <strong>{provider.displayName || provider.id}</strong>
                      <span>
                        {provider.modelCount ?? models.length} models
                        {provider.lastObservationAt
                          ? ` · last activity ${new Date(provider.lastObservationAt).toLocaleString()}`
                          : ''}
                      </span>
                    </div>
                    <div className="provider-health-card-metrics">
                      <span className={`ph-status ${statusBadgeClass(provider.statusKey)}`}>
                        {provider.status}
                      </span>
                      <span>Success {formatPercent(provider.successRate)}</span>
                      <span>
                        Latency{' '}
                        {provider.averageLatencyMs != null ? `${provider.averageLatencyMs} ms` : '—'}
                      </span>
                    </div>
                  </button>
                  {open && (
                    <div className="provider-health-card-body">
                      {provider.explanation && (
                        <p className="provider-health-card-note">{provider.explanation}</p>
                      )}
                      <div className="provider-health-model-table-wrap">
                        <table className="provider-health-model-table">
                          <thead>
                            <tr>
                              <th>Model</th>
                              <th>Status</th>
                              <th>Success</th>
                              <th>Latency</th>
                              <th>Last success</th>
                              <th>Last error</th>
                            </tr>
                          </thead>
                          <tbody>
                            {models.length === 0 && (
                              <tr>
                                <td colSpan={6}>No model telemetry for this provider yet.</td>
                              </tr>
                            )}
                            {models.map((m) => (
                              <tr key={m.id}>
                                <td>{m.displayName || m.id}</td>
                                <td>
                                  <span className={`ph-status ${statusBadgeClass(m.statusKey)}`}>
                                    {m.status}
                                  </span>
                                </td>
                                <td>{formatPercent(m.successRate)}</td>
                                <td>{m.averageLatencyMs != null ? `${m.averageLatencyMs} ms` : '—'}</td>
                                <td>
                                  {m.lastSuccessfulRequestAt
                                    ? new Date(m.lastSuccessfulRequestAt).toLocaleString()
                                    : '—'}
                                </td>
                                <td>{m.lastErrorCategory ? m.lastErrorCategory.replace(/_/g, ' ') : '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </section>
        </>
      )}
    </main>
  );
}
