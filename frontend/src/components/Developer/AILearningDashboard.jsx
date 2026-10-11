import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../lib/api';
import './AILearningDashboard.css';

const TABS = [
  { id: 'knowledge', label: 'Knowledge Learning' },
  { id: 'router', label: 'Smart Router Learning' },
  { id: 'evaluation', label: 'AI Evaluation' },
];

export default function AILearningDashboard() {
  const [tab, setTab] = useState('knowledge');
  const [data, setData] = useState(null);
  const [audit, setAudit] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [evalBusy, setEvalBusy] = useState('');
  const [collectionName, setCollectionName] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [dashRes, auditRes] = await Promise.all([
        apiFetch('/api/intelligence/learning-dashboard'),
        apiFetch('/api/intelligence/audit'),
      ]);
      const dash = await dashRes.json().catch(() => ({}));
      const auditBody = await auditRes.json().catch(() => ({}));
      if (!dashRes.ok) throw new Error(dash.message || 'Dashboard unavailable');
      if (!auditRes.ok) throw new Error(auditBody.message || 'Audit unavailable');
      setData(dash);
      setAudit(auditBody);
    } catch (err) {
      setError(err.message || 'Could not load AI Learning dashboard');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const runDeterministicSuite = async (suiteId) => {
    setEvalBusy(suiteId);
    setError('');
    try {
      const res = await apiFetch('/api/intelligence/evaluation/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suiteId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || 'Run failed');
      await load();
    } catch (err) {
      setError(err.message || 'Evaluation run failed');
    } finally {
      setEvalBusy('');
    }
  };

  const createCollection = async (event) => {
    event.preventDefault();
    if (!collectionName.trim()) return;
    setError('');
    try {
      const res = await apiFetch('/api/intelligence/knowledge/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: collectionName.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || 'Could not create collection');
      setCollectionName('');
      await load();
    } catch (err) {
      setError(err.message || 'Collection create failed');
    }
  };

  if (loading && !data) {
    return (
      <main className="ai-learning-page">
        <p className="ai-learning-muted">Loading AI Learning dashboard…</p>
      </main>
    );
  }

  return (
    <main className="ai-learning-page">
      <header className="ai-learning-head">
        <div>
          <p className="ai-learning-eyebrow">Developer only · measured intelligence loop</p>
          <h1>AI Learning</h1>
          <p className="ai-learning-lead">
            Knowledge retrieval, router telemetry, and deterministic benchmarks. Scores appear only when labeled data or tests exist — nothing is fabricated.
          </p>
        </div>
        <Link to="/" className="ai-learning-back">← Back to chat</Link>
      </header>

      {error && <p className="ai-learning-error" role="alert">{error}</p>}

      <nav className="ai-learning-tabs" aria-label="Learning sections">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={tab === item.id ? 'active' : ''}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {tab === 'knowledge' && data?.knowledge && (
        <section className="ai-learning-panel">
          <div className="ai-learning-grid">
            <article className="ai-learning-card">
              <h2>Indexed documents</h2>
              <p className="ai-learning-stat">{data.knowledge.documentCount}</p>
              <p className="ai-learning-muted">{data.knowledge.readyDocuments} ready</p>
            </article>
            <article className="ai-learning-card">
              <h2>Collections</h2>
              <p className="ai-learning-stat">{data.knowledge.collectionCount}</p>
              <form className="ai-learning-inline-form" onSubmit={createCollection}>
                <input
                  value={collectionName}
                  onChange={(e) => setCollectionName(e.target.value)}
                  placeholder="New collection name"
                  maxLength={120}
                />
                <button type="submit">Create</button>
              </form>
            </article>
          </div>
          <h3>Recent documents</h3>
          <ul className="ai-learning-list">
            {(data.knowledge.recentDocuments || []).map((doc) => (
              <li key={doc.id}>
                <strong>{doc.name}</strong>
                <span>{doc.status} · {doc.chunkCount ?? doc.chunk_count ?? 0} chunks</span>
              </li>
            ))}
          </ul>
          <p className="ai-learning-muted">
            Run labeled retrieval evaluation via POST /api/intelligence/knowledge/retrieval-eval with expectedChunkIds.
          </p>
        </section>
      )}

      {tab === 'router' && data?.router && (
        <section className="ai-learning-panel">
          <p className="ai-learning-muted">
            Active env policy: <strong>{data.router.envPolicyVersion}</strong>
            {data.router.adaptiveEnabled ? ' (adaptive boost on)' : ''}
          </p>
          <h3>Provider scores (measured)</h3>
          <ul className="ai-learning-list">
            {(data.router.providerScores || []).map((row) => (
              <li key={row.provider}>
                <strong>{row.provider}</strong>
                <span>
                  n={row.sampleSize ?? '—'}
                  {' · '}
                  score={row.score?.score ?? 'insufficient data'}
                  {row.score?.uncertainty ? ` · ${row.score.uncertainty} uncertainty` : ''}
                </span>
              </li>
            ))}
            {!data.router.providerScores?.length && (
              <li className="ai-learning-muted">No router_metrics yet — chat traffic populates this table.</li>
            )}
          </ul>
          <h3>Task categories</h3>
          <ul className="ai-learning-list compact">
            {(data.router.taskCategoryScores || []).slice(0, 12).map((row) => (
              <li key={`${row.taskType}-${row.provider}-${row.model}`}>
                <strong>{row.taskType}</strong> — {row.provider}/{row.model}
                <span> n={row.sampleSize} · score={row.score?.score ?? '—'}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {tab === 'evaluation' && data?.evaluation && (
        <section className="ai-learning-panel">
          <h3>Deterministic suites (no API cost)</h3>
          <ul className="ai-learning-list">
            {(data.evaluation.suites || []).map((suite) => (
              <li key={suite.id}>
                <strong>{suite.label}</strong>
                <span>{suite.caseCount} cases · v{suite.datasetVersion}</span>
                <button
                  type="button"
                  disabled={evalBusy === suite.id}
                  onClick={() => runDeterministicSuite(suite.id)}
                >
                  {evalBusy === suite.id ? 'Running…' : 'Run suite'}
                </button>
              </li>
            ))}
          </ul>
          <h3>Recent runs</h3>
          <ul className="ai-learning-list">
            {(data.evaluation.recentRuns || []).map((run) => {
              let summary = run.summary;
              if (typeof summary === 'string') {
                try { summary = JSON.parse(summary); } catch { summary = {}; }
              }
              return (
                <li key={run.id}>
                  <strong>{run.suite}</strong>
                  <span>{run.status} · pass rate {summary?.passRate ?? '—'}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {audit?.modules && (
        <footer className="ai-learning-audit">
          <h3>Phase 1 audit snapshot</h3>
          <p className="ai-learning-muted">Updated {audit.auditedAt}</p>
          <ul className="ai-learning-list compact">
            {Object.entries(audit.modules).map(([key, mod]) => (
              <li key={key}>
                <strong>{key}</strong>
                {mod.service && <span> — {mod.service}</span>}
              </li>
            ))}
          </ul>
        </footer>
      )}
    </main>
  );
}
