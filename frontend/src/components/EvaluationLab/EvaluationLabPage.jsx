import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../lib/api';
import { useLanguage } from '../../lib/useLanguage';
import '../KnowledgeBase/KnowledgeBase.css';

const DEFAULT_MODELS = ['gemini', 'claude', 'gpt'];

export default function EvaluationLabPage() {
  const { t } = useLanguage();
  const [suites, setSuites] = useState([]);
  const [runs, setRuns] = useState([]);
  const [datasetId, setDatasetId] = useState('coding');
  const [models, setModels] = useState(['gemini']);
  const [activeRun, setActiveRun] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [filterModel, setFilterModel] = useState('');

  const load = useCallback(async () => {
    const [suiteRes, runRes] = await Promise.all([
      apiFetch('/api/evaluation/suites'),
      apiFetch('/api/evaluation/runs'),
    ]);
    const suiteData = await suiteRes.json().catch(() => ({}));
    const runData = await runRes.json().catch(() => ({}));
    if (!suiteRes.ok) throw new Error(suiteData.message || 'Suites unavailable');
    if (!runRes.ok) throw new Error(runData.message || 'Runs unavailable');
    setSuites(suiteData.suites || []);
    setRuns(runData.runs || []);
  }, []);

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);

  const toggleModel = (slug) => {
    setModels((current) => (
      current.includes(slug) ? current.filter((item) => item !== slug) : [...current, slug]
    ));
  };

  const startRun = async () => {
    setBusy('run');
    setError('');
    try {
      const res = await apiFetch('/api/evaluation/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ datasetId, models }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Evaluation failed');
      setActiveRun(data.run);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  };

  const exportRun = async (format) => {
    if (!activeRun?.id) return;
    const res = await apiFetch(`/api/evaluation/runs/${encodeURIComponent(activeRun.id)}/export?format=${format}`);
    const body = await res.text();
    if (!res.ok) {
      setError('Export failed');
      return;
    }
    const blob = new Blob([body], { type: format === 'csv' ? 'text/csv' : 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `eval-${activeRun.id}.${format}`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const chartRows = useMemo(() => {
    const rows = activeRun?.results || [];
    const filtered = filterModel ? rows.filter((row) => row.model === filterModel) : rows;
    const byModel = {};
    for (const row of filtered) {
      if (!byModel[row.model]) byModel[row.model] = { model: row.model, latency: 0, passed: 0, total: 0 };
      byModel[row.model].latency += row.latencyMs || 0;
      byModel[row.model].total += 1;
      if (row.scoring?.passed) byModel[row.model].passed += 1;
    }
    return Object.values(byModel);
  }, [activeRun, filterModel]);

  return (
    <main className="kb-page">
      <header className="kb-header">
        <Link className="kb-brand" to="/dashboard">AllModelAI</Link>
        <nav className="kb-nav">
          <Link to="/arena">{t('Arena')}</Link>
          <Link to="/model-comparison">{t('Model Comparison')}</Link>
        </nav>
      </header>
      <section className="kb-hero">
        <h1>{t('AI Evaluation Lab')}</h1>
        <p>{t('Compare models on coding, math, reasoning, summarization and documents. AI-judged scores are labeled and not verified objective accuracy.')}</p>
      </section>

      {error ? <p className="kb-error" role="alert">{error}</p> : null}

      <section className="kb-panel">
        <label>
          {t('Dataset')}
          <select value={datasetId} onChange={(e) => setDatasetId(e.target.value)}>
            {suites.map((suite) => (
              <option key={suite.id} value={suite.id}>{suite.name} ({suite.itemCount})</option>
            ))}
          </select>
        </label>
        <div className="kb-actions">
          {DEFAULT_MODELS.map((slug) => (
            <label key={slug}>
              <input type="checkbox" checked={models.includes(slug)} onChange={() => toggleModel(slug)} />
              {slug}
            </label>
          ))}
        </div>
        <button type="button" onClick={startRun} disabled={busy === 'run' || !models.length}>
          {busy === 'run' ? t('Running…') : t('Start evaluation')}
        </button>
      </section>

      {activeRun ? (
        <section className="kb-panel">
          <h2>{t('Results')} — {activeRun.status}</h2>
          <p className="kb-empty">{activeRun.disclaimer || t('AI-judged scores are not verified objective accuracy.')}</p>
          <div className="kb-actions">
            <label>
              {t('Filter model')}
              <select value={filterModel} onChange={(e) => setFilterModel(e.target.value)}>
                <option value="">{t('All')}</option>
                {(activeRun.models || []).map((model) => (
                  <option key={model} value={model}>{model}</option>
                ))}
              </select>
            </label>
            <button type="button" onClick={() => exportRun('json')}>{t('Export JSON')}</button>
            <button type="button" onClick={() => exportRun('csv')}>{t('Export CSV')}</button>
          </div>
          <table className="kb-table">
            <thead>
              <tr>
                <th>{t('Model')}</th>
                <th>{t('Avg latency')}</th>
                <th>{t('Deterministic pass')}</th>
              </tr>
            </thead>
            <tbody>
              {chartRows.map((row) => (
                <tr key={row.model}>
                  <td>{row.model}</td>
                  <td>{row.total ? Math.round(row.latency / row.total) : 0} ms</td>
                  <td>{row.passed}/{row.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul>
            {(activeRun.results || []).slice(0, 20).map((row) => (
              <li key={`${row.itemId}-${row.model}`}>
                <strong>{row.model}</strong> · {row.itemId} · {row.scoring?.method}
                {row.scoring?.method === 'ai_judge' ? ` · ${t('AI-judged (not verified)')}` : null}
                {row.scoring?.passed === true ? ` · ${t('pass')}` : null}
                {row.scoring?.passed === false ? ` · ${t('fail')}` : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="kb-panel">
        <h2>{t('Your runs')}</h2>
        {!runs.length ? <p className="kb-empty">{t('No evaluation runs yet.')}</p> : (
          <ul className="kb-doc-list">
            {runs.map((item) => (
              <li key={item.id}>
                <span>{item.datasetId} · {item.status} · {(item.models || []).join(', ')}</span>
                <button
                  type="button"
                  onClick={async () => {
                    const res = await apiFetch(`/api/evaluation/runs/${encodeURIComponent(item.id)}`);
                    const data = await res.json().catch(() => ({}));
                    if (res.ok) setActiveRun({ ...data.run, disclaimer: data.disclaimer });
                  }}
                >
                  {t('Open')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
