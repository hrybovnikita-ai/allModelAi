import { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api';
import { formatSubscriptionPlanLabel } from '../../lib/planLabels';

export default function ManageSubscriptionModal({ onClose, onUpdated }) {
  const [summary, setSummary] = useState(null);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([
      apiFetch('/api/subscription').then((r) => (r.ok ? r.json() : null)),
      apiFetch('/api/payments/history').then((r) => (r.ok ? r.json() : { payments: [] })),
    ])
      .then(([sub, pay]) => {
        if (sub) setSummary(sub);
        setHistory(Array.isArray(pay?.payments) ? pay.payments : []);
      })
      .catch(() => setError('Could not load subscription details.'));
  }, []);

  const endTestSubscription = async () => {
    setBusy(true);
    setError('');
    try {
      const response = await apiFetch('/api/subscription/cancel-test', { method: 'POST' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Could not cancel test subscription.');
      onUpdated?.(data);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dashboard-modal-backdrop" role="presentation" onClick={onClose}>
      <div className="dashboard-modal" role="dialog" aria-labelledby="manage-sub-title" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="dashboard-modal-close" onClick={onClose} aria-label="Close">×</button>
        <h2 id="manage-sub-title">Manage subscription</h2>
        {(summary?.showTestModeBanner || summary?.canUseOwnerTestCheckout) && summary?.wayforpayTestMode && (
          <p className="dashboard-sub-test-note">TEST MODE — simulated WayForPay only. No real money is charged.</p>
        )}
        {summary ? (
          <dl className="dashboard-sub-details">
            <div><dt>Current plan</dt><dd>{formatSubscriptionPlanLabel(summary)}</dd></div>
            <div><dt>Requests remaining</dt><dd>{summary.remaining?.toLocaleString?.() ?? summary.remaining}</dd></div>
            <div><dt>Status</dt><dd>{summary.subscriptionStatus === 'active' ? 'Active' : summary.subscriptionStatus}</dd></div>
            {summary.renewalLabel && <div><dt>Renewal</dt><dd>{summary.renewalLabel.replace('Renews/Expires: ', '')}</dd></div>}
            {summary.orderReference && <div><dt>Order ref</dt><dd><code>{summary.orderReference}</code></dd></div>}
            {summary.limit != null && (
              <div><dt>Monthly quota</dt><dd>{Number(summary.limit).toLocaleString()} requests</dd></div>
            )}
            {summary.used != null && (
              <div><dt>Used this period</dt><dd>{Number(summary.used).toLocaleString()}</dd></div>
            )}
          </dl>
        ) : (
          <p>Loading…</p>
        )}
        {history.length > 0 && (
          <div className="dashboard-sub-history">
            <h3>Payment history</h3>
            <ul>
              {history.map((row) => (
                <li key={row.orderReference}>
                  <span>{row.planName} · ${Number(row.amount).toFixed(2)} {row.currency}</span>
                  <span>{row.status}{row.test ? ' (test)' : ''}</span>
                  <small>{row.paidAt || row.createdAt}</small>
                </li>
              ))}
            </ul>
          </div>
        )}
        {error && <p className="dashboard-modal-error" role="alert">{error}</p>}
        {summary?.manageTestSubscription && (
          <button type="button" className="dashboard-modal-danger" disabled={busy} onClick={endTestSubscription}>
            {busy ? 'Ending…' : 'End test subscription (return to Free)'}
          </button>
        )}
      </div>
    </div>
  );
}
