import { apiFetch } from '../../lib/api';
import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import './Admin.css';

function formatUptime(seconds) {
  const s = Number(seconds) || 0;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

function StatusPill({ ok, label }) {
  return (
    <span className={`admin-pill ${ok ? 'admin-pill--ok' : 'admin-pill--warn'}`}>{label}</span>
  );
}

export default function Admin() {
  const [key, setKey] = useState('');
  const [stats, setStats] = useState(null);
  const [ops, setOps] = useState(null);
  const [providers, setProviders] = useState(null);
  const [liveHealth, setLiveHealth] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [probing, setProbing] = useState(false);
  const [tab, setTab] = useState('overview');
  const [aiImprovement, setAiImprovement] = useState(null);

  const adminHeaders = useCallback(
    () => ({ headers: { 'x-admin-key': key } }),
    [key],
  );

  const loadAll = async (event) => {
    event?.preventDefault();
    setLoading(true);
    setError('');
    try {
      const [healthRes, statsRes, opsRes, providersRes, improvementRes] = await Promise.all([
        apiFetch('/api/health'),
        apiFetch('/api/admin/stats', adminHeaders()),
        apiFetch('/api/admin/ops/dashboard', adminHeaders()),
        apiFetch('/api/admin/ops/providers', adminHeaders()),
        apiFetch('/api/admin/ai-improvement', adminHeaders()),
      ]);
      const healthData = await healthRes.json().catch(() => ({}));
      const statsData = await statsRes.json().catch(() => ({}));
      const opsData = await opsRes.json().catch(() => ({}));
      const providersData = await providersRes.json().catch(() => ({}));
      const improvementData = await improvementRes.json().catch(() => ({}));

      if (!statsRes.ok) {
        setError(statsData.message || 'Could not load admin statistics.');
        setStats(null);
        setOps(null);
        setProviders(null);
        return;
      }
      setLiveHealth(healthRes.ok ? healthData : null);
      setStats(statsData);
      setOps(opsRes.ok ? opsData : null);
      setProviders(providersRes.ok ? providersData : null);
      setAiImprovement(improvementRes.ok ? improvementData : null);
      if (!opsRes.ok && opsData.message) {
        setError((prev) => prev || opsData.message);
      }
    } catch (loadError) {
      setError(loadError.message || 'Could not reach the backend.');
    } finally {
      setLoading(false);
    }
  };

  const runProviderProbe = async () => {
    setProbing(true);
    try {
      const response = await apiFetch('/api/admin/ops/providers?probe=1', adminHeaders());
      const data = await response.json().catch(() => ({}));
      if (response.ok) setProviders(data);
      else setError(data.message || 'Provider probe failed.');
    } finally {
      setProbing(false);
    }
  };

  const readiness = ops?.readiness;
  const traffic = ops?.traffic;

  return (
    <main className="admin-page">
      <nav className="admin-nav">
        <Link to="/">← AllModelAI</Link>
        <strong>Backend Control Center</strong>
        <Link to="/control-center">Control Center</Link>
      </nav>

      <section className="admin-shell">
        <span>Operations</span>
        <h1>Backend monitoring</h1>
        <p>
          Secure operational view: health, traffic, providers, and alerts. No chat content or secrets are shown.
        </p>

        <form className="admin-key-form" onSubmit={loadAll}>
          <label>
            Admin key
            <input
              type="password"
              value={key}
              onChange={(event) => setKey(event.target.value)}
              placeholder="ADMIN_KEY from backend environment"
              required
              autoComplete="off"
            />
          </label>
          <button type="submit" disabled={loading}>
            {loading ? 'Loading…' : 'Load dashboard'}
          </button>
        </form>

        {error && (
          <p className="admin-error" role="alert">
            {error}
          </p>
        )}

        {(stats || ops) && (
          <>
            <div className="admin-tabs" role="tablist">
              {['overview', 'providers', 'improvement', 'alerts'].map((id) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  className={tab === id ? 'active' : ''}
                  onClick={() => setTab(id)}
                >
                  {id === 'overview' ? 'Overview' : id === 'providers' ? 'Providers' : id === 'improvement' ? 'AI improvement' : 'Alerts'}
                </button>
              ))}
            </div>

            {tab === 'overview' && (
              <div className="admin-dashboard">
                <div className="admin-card-grid">
                  <article className="admin-card">
                    <small>API liveness</small>
                    <strong>{liveHealth?.status === 'ok' ? 'Online' : 'Unknown'}</strong>
                    <StatusPill ok={liveHealth?.status === 'ok'} label={liveHealth?.service || 'allmodelai-backend'} />
                  </article>
                  <article className="admin-card">
                    <small>Readiness</small>
                    <strong>{readiness?.status === 'ready' ? 'Ready' : 'Degraded'}</strong>
                    <StatusPill
                      ok={readiness?.database?.connected}
                      label={readiness?.database?.connected ? 'Database OK' : 'Database down'}
                    />
                  </article>
                  <article className="admin-card">
                    <small>Uptime</small>
                    <strong>{formatUptime(readiness?.uptimeSeconds ?? liveHealth?.uptimeSeconds)}</strong>
                  </article>
                  <article className="admin-card">
                    <small>Active sessions</small>
                    <strong>{ops?.activeSessions ?? stats?.activeSessions ?? '—'}</strong>
                  </article>
                </div>

                <div className="admin-card-grid admin-card-grid--stats">
                  {[['Users', stats?.users], ['Conversations', stats?.conversations], ['Purchases', stats?.purchases]].map(
                    ([label, value]) => (
                      <article key={label} className="admin-card admin-card--compact">
                        <small>{label}</small>
                        <strong>{value ?? '—'}</strong>
                      </article>
                    ),
                  )}
                </div>

                {traffic && (
                  <section className="admin-panel">
                    <h2>Traffic ({traffic.windowMinutes} min)</h2>
                    <div className="admin-metrics-row">
                      <div>
                        <small>Requests</small>
                        <strong>{traffic.requestCount}</strong>
                      </div>
                      <div>
                        <small>Avg latency</small>
                        <strong>{traffic.avgLatencyMs} ms</strong>
                      </div>
                      <div>
                        <small>P95 latency</small>
                        <strong>{traffic.p95LatencyMs} ms</strong>
                      </div>
                      <div>
                        <small>4xx / 5xx</small>
                        <strong>
                          {traffic.http4xx} / {traffic.http5xx}
                        </strong>
                      </div>
                      <div>
                        <small>Error rate</small>
                        <strong>{(traffic.errorRate * 100).toFixed(1)}%</strong>
                      </div>
                    </div>
                    {traffic.topRoutes?.length > 0 && (
                      <table className="admin-table">
                        <thead>
                          <tr>
                            <th>Route</th>
                            <th>Count</th>
                            <th>Errors</th>
                            <th>Avg ms</th>
                          </tr>
                        </thead>
                        <tbody>
                          {traffic.topRoutes.map((row) => (
                            <tr key={row.route}>
                              <td>{row.route}</td>
                              <td>{row.count}</td>
                              <td>{row.errors}</td>
                              <td>{row.avgLatencyMs}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </section>
                )}

                {ops?.routerSummary && (
                  <section className="admin-panel">
                    <h2>Smart Router (24h)</h2>
                    <p className="admin-muted">
                      Requests: {ops.routerSummary.last24hRequests ?? '—'} · Failures:{' '}
                      {ops.routerSummary.failures ?? '—'} · Fallbacks: {ops.routerSummary.fallbacks ?? '—'}
                    </p>
                  </section>
                )}
              </div>
            )}

            {tab === 'providers' && (
              <section className="admin-panel">
                <div className="admin-panel-head">
                  <h2>AI providers</h2>
                  <button type="button" className="admin-secondary" disabled={probing} onClick={() => { void runProviderProbe(); }}>
                    {probing ? 'Probing…' : 'Run active probe'}
                  </button>
                </div>
                <p className="admin-muted">
                  Passive status uses recent chat telemetry. Active probes are rate-limited and may incur minor API cost.
                </p>
                <div className="admin-provider-grid">
                  {providers?.providers &&
                    Object.entries(providers.providers).map(([id, row]) => (
                      <article key={id} className="admin-provider-card">
                        <header>
                          <strong>{id}</strong>
                          <span className={`admin-availability admin-availability--${row.availability || 'unknown'}`}>
                            {row.availability || row.status}
                          </span>
                        </header>
                        <p>
                          {row.configured ? 'Configured' : 'Not configured'}
                          {row.model ? ` · ${row.model}` : ''}
                        </p>
                        {row.lastLatencyMs != null && <small>Last latency: {row.lastLatencyMs} ms</small>}
                      </article>
                    ))}
                </div>
              </section>
            )}

            {tab === 'improvement' && (
              <section className="admin-panel">
                <h2>AI improvement metrics</h2>
                {!aiImprovement && <p className="admin-muted">Load the dashboard with a valid admin key.</p>}
                {aiImprovement && (
                  <>
                    <p className="admin-muted">
                      Router policy: {aiImprovement.routerPolicy} · Updated {aiImprovement.updatedAt}
                    </p>
                    <div className="admin-card-grid admin-card-grid--stats">
                      <article className="admin-card admin-card--compact">
                        <small>Memory enabled users</small>
                        <strong>{aiImprovement.memory?.usersWithMemoryEnabled ?? 0}</strong>
                      </article>
                      <article className="admin-card admin-card--compact">
                        <small>Stored memories</small>
                        <strong>{aiImprovement.memory?.memoryItems ?? 0}</strong>
                      </article>
                      <article className="admin-card admin-card--compact">
                        <small>KB documents (ready)</small>
                        <strong>
                          {aiImprovement.knowledge?.readyDocuments ?? 0}/{aiImprovement.knowledge?.documents ?? 0}
                        </strong>
                      </article>
                      <article className="admin-card admin-card--compact">
                        <small>KB chunks</small>
                        <strong>{aiImprovement.knowledge?.chunks ?? 0}</strong>
                      </article>
                    </div>
                    {aiImprovement.feedback?.totals?.length > 0 && (
                      <table className="admin-table">
                        <thead>
                          <tr>
                            <th>Feedback</th>
                            <th>Count (30d)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {aiImprovement.feedback.totals.map((row) => (
                            <tr key={row.rating}>
                              <td>{row.rating}</td>
                              <td>{row.count}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    {Object.keys(aiImprovement.routerPerformance || {}).length > 0 && (
                      <table className="admin-table">
                        <thead>
                          <tr>
                            <th>Provider</th>
                            <th>Success rate</th>
                            <th>Avg latency</th>
                            <th>Samples</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(aiImprovement.routerPerformance).map(([provider, stats]) => (
                            <tr key={provider}>
                              <td>{provider}</td>
                              <td>
                                {stats.successRate != null ? `${(stats.successRate * 100).toFixed(1)}%` : '—'}
                              </td>
                              <td>{stats.avgLatencyMs != null ? `${Math.round(stats.avgLatencyMs)} ms` : '—'}</td>
                              <td>{stats.sampleSize ?? 0}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    <ul className="admin-muted">
                      {(aiImprovement.notes || []).map((note) => (
                        <li key={note}>{note}</li>
                      ))}
                    </ul>
                  </>
                )}
              </section>
            )}

            {tab === 'alerts' && (
              <section className="admin-panel">
                <h2>Recent alerts</h2>
                {!ops?.alerts?.length && <p className="admin-muted">No recent operational alerts in this process.</p>}
                <ul className="admin-alert-list">
                  {(ops?.alerts || []).map((alert) => (
                    <li key={`${alert.at}-${alert.message}`}>
                      <time dateTime={alert.at}>{alert.at}</time>
                      <span className={`admin-alert-level admin-alert-level--${alert.level}`}>{alert.category}</span>
                      <p>{alert.message}</p>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </section>
    </main>
  );
}
