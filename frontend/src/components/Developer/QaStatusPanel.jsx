function SuiteRow({ label, suite }) {
  if (!suite || suite.status === 'not_run') {
    return (
      <tr>
        <td>{label}</td>
        <td colSpan={4} className="qa-status-muted">Not recorded on this server</td>
      </tr>
    );
  }
  const ok = (suite.failed || 0) === 0 && (suite.passed || 0) > 0;
  return (
    <tr className={ok ? 'qa-status-ok' : 'qa-status-fail'}>
      <td>{label}</td>
      <td>{suite.total ?? '—'}</td>
      <td>{suite.passed ?? '—'}</td>
      <td>{suite.failed ?? '—'}</td>
      <td>{suite.skipped ?? 0}</td>
    </tr>
  );
}

export default function QaStatusPanel({ qa }) {
  if (!qa) return null;

  return (
    <section className="qa-status-panel" aria-labelledby="qa-status-heading">
      <h2 id="qa-status-heading">Automated QA (recorded runs)</h2>
      {!qa.available && (
        <p className="qa-status-muted" role="status">{qa.message}</p>
      )}
      {qa.available && (
        <>
          <p className="qa-status-meta" role="status">
            Last recorded: {qa.recordedAt || '—'}
            {qa.source ? ` · ${qa.source}` : ''}
            {qa.buildStatus ? ` · build ${qa.buildStatus}` : ''}
          </p>
          {qa.authentication?.status && (
            <p className="qa-status-auth">
              Authentication regression: <strong>{qa.authentication.status}</strong>
            </p>
          )}
          <div className="model-diagnostics-table-wrap">
            <table className="model-diagnostics-table qa-status-table">
              <thead>
                <tr>
                  <th>Suite</th>
                  <th>Total</th>
                  <th>Passed</th>
                  <th>Failed</th>
                  <th>Skipped</th>
                </tr>
              </thead>
              <tbody>
                <SuiteRow label="Backend critical" suite={qa.suites?.backendCritical} />
                <SuiteRow label="Frontend critical" suite={qa.suites?.frontendCritical} />
                <SuiteRow label="Playwright smoke" suite={qa.suites?.playwrightSmoke} />
              </tbody>
            </table>
          </div>
          {Array.isArray(qa.failures) && qa.failures.length > 0 && (
            <details className="qa-status-failures">
              <summary>Failed checks ({qa.failures.length})</summary>
              <ul>
                {qa.failures.map((f, i) => (
                  <li key={`${f.label}-${i}`}>{f.label || f.suite}</li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}
