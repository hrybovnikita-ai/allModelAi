import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../lib/api';
import ProviderHealthPanel from './ProviderHealthPanel';
import QaStatusPanel from './QaStatusPanel';
import './ModelDiagnostics.css';

function statusLabel(row) {
    if (row.healthStatus) return row.healthStatus;
    if (row.availabilityStatus === 'WORKING') return 'Working';
    if (row.availabilityStatus === 'UNCONFIGURED') return 'Missing API Key';
    return 'Not Tested';
}

export default function ModelDiagnostics() {
  const [catalog, setCatalog] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [testingKey, setTestingKey] = useState('');
  const [confirmBillable, setConfirmBillable] = useState(false);

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch('/api/developer/model-diagnostics');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Diagnostics unavailable');
      setCatalog(data);
    } catch (err) {
      setError(err.message || 'Could not load diagnostics');
      setCatalog(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  const rows = useMemo(() => catalog?.models || [], [catalog]);

  const runTest = async (row) => {
    const key = `${row.slug}:${row.variantId}`;
    if (!confirmBillable) {
      setError('Check the confirmation box — each test uses real provider quota.');
      return;
    }
    setTestingKey(key);
    setError('');
    try {
      const res = await apiFetch('/api/developer/model-diagnostics/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: row.slug,
          variantId: row.variantId,
          confirmBillable: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok && data.code !== 'CONFIRMATION_REQUIRED') {
        throw new Error(data.message || data.lastTest?.errorDescription || 'Test failed');
      }
      await loadCatalog();
    } catch (err) {
      setError(err.message || 'Test failed');
    } finally {
      setTestingKey('');
    }
  };

  return (
    <main className="model-diagnostics-page">
      <header className="model-diagnostics-head">
        <div>
          <p className="model-diagnostics-eyebrow">Developer only · Local Plus Test Mode</p>
          <h1>Model Health</h1>
          <p className="model-diagnostics-lead">
            Developer-only live inference checks. A model shows <strong>Working</strong> only after a successful real test — never from catalog presence alone.
          </p>
        </div>
        <Link to="/chat" className="model-diagnostics-back">← Back to chat</Link>
      </header>

      {catalog?.stripeTestMode != null && (
        <p className="model-diagnostics-stripe" role="status">
          Stripe checkout: {catalog.stripeTestMode ? 'test mode (sk_test_)' : 'live keys detected — use test keys locally'}
        </p>
      )}

      <label className="model-diagnostics-confirm">
        <input type="checkbox" checked={confirmBillable} onChange={(e) => setConfirmBillable(e.target.checked)} />
        I understand each test sends a short prompt to the real provider and may use billable quota.
      </label>

      <QaStatusPanel qa={catalog?.qa} />

      <ProviderHealthPanel />

      {error && <p className="model-diagnostics-error" role="alert">{error}</p>}
      {loading && <p className="model-diagnostics-loading">Loading catalog…</p>}

      {catalog?.summary && !loading && (
        <div className="model-diagnostics-summary" role="status">
          <span>{catalog.summary.total} models</span>
          <span className="md-ok">{catalog.summary.working} working</span>
          <span className="md-fail">{catalog.summary.failing} failing</span>
          <span>{catalog.summary.notTested} not tested</span>
        </div>
      )}

      {!loading && rows.length > 0 && (
        <div className="model-diagnostics-table-wrap">
          <table className="model-diagnostics-table">
            <thead>
              <tr>
                <th>Provider</th>
                <th>Model</th>
                <th>Identifier</th>
                <th>Vision</th>
                <th>Text</th>
                <th>Status</th>
                <th>Latency</th>
                <th>Last test</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const key = `${row.slug}:${row.variantId}`;
                const last = row.lastTest;
                return (
                  <tr key={key}>
                    <td>{row.provider}</td>
                    <td>{row.displayName} <small>({row.slug}/{row.variantId})</small></td>
                    <td className="model-diagnostics-mono">{row.modelIdentifier}</td>
                    <td>{row.visionSupport ? 'Yes' : 'No'}</td>
                    <td>{row.textGenerationSupport ? 'Yes' : 'No'}</td>
                    <td>{statusLabel(row)}</td>
                    <td>{row.latencyMs != null ? `${row.latencyMs} ms` : '—'}</td>
                    <td>
                      {last ? (
                        <>
                          <span className={last.ok ? 'md-ok' : 'md-fail'}>{last.ok ? 'Pass' : 'Fail'}</span>
                          {last.httpStatus ? ` · HTTP ${last.httpStatus}` : ''}
                          {last.errorDescription ? (
                            <small className="model-diagnostics-err">{last.errorDescription}</small>
                          ) : null}
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="model-diagnostics-test-btn"
                        disabled={testingKey === key || row.availabilityStatus === 'blocked'}
                        onClick={() => runTest(row)}
                      >
                        {testingKey === key ? 'Testing…' : 'Test model'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
