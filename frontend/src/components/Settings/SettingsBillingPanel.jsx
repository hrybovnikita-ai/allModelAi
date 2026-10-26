import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../lib/api';
import { normalizeCreditStatus } from '../../lib/creditStatus';
import { formatSubscriptionPlanLabel } from '../../lib/planLabels';

export default function SettingsBillingPanel() {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void apiFetch('/api/credits')
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!active) return;
        if (!data) {
          setError('Could not load billing status.');
          return;
        }
        setStatus(normalizeCreditStatus(data));
      })
      .catch(() => {
        if (active) setError('Could not load billing status.');
      });
    return () => {
      active = false;
    };
  }, []);

  const planLabel = status ? formatSubscriptionPlanLabel(status) : '…';
  const credits = status?.remaining ?? status?.creditsRemaining ?? status?.credits ?? null;

  return (
    <section id="settings-billing" className="settings-card">
      <div>
        <span>Billing</span>
        <h2>Subscription & billing</h2>
        <p className="settings-security-hint">
          Manage your plan and AI credits for this account only.
        </p>
      </div>
      {error ? <p className="settings-password-error" role="alert">{error}</p> : null}
      {!error ? (
        <div className="settings-billing-summary">
          <p><strong>Current plan:</strong> {planLabel}</p>
          {credits != null ? (
            <p><strong>AI credits:</strong> {credits}</p>
          ) : null}
          <div className="settings-password-actions">
            <Link className="settings-save" to="/credits">Manage credits</Link>
            <Link className="settings-security-link" to="/dashboard">Open dashboard</Link>
            <Link className="settings-security-link" to="/billing">Billing overview</Link>
            <Link className="settings-security-link" to="/checkout/pro">Plans & checkout</Link>
          </div>
        </div>
      ) : null}
    </section>
  );
}
