import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../lib/api';
import { formatPaymentOrderStatus, paymentStatusClass } from '../../lib/paymentOrderStatus';
import './PaymentOrderHistory.css';
import './DashboardButtons.css';

export default function PaymentOrderHistory() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/api/payments/history?limit=50')
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('Could not load orders'))))
      .then((data) => setRows(Array.isArray(data?.payments) ? data.payments : []))
      .catch((err) => setError(err.message || 'Could not load order history.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="dashboard-page dashboard-violet payment-history-page">
      <div className="dashboard-shell payment-history-shell">
        <header className="payment-history-header">
          <div>
            <p className="dashboard-eyebrow">Billing</p>
            <h1>Order history</h1>
            <p>WayForPay orders for subscriptions and AI credit packs. Access is granted only after verified payment.</p>
          </div>
          <Link to="/dashboard" className="payment-history-back">← Dashboard</Link>
        </header>

        {loading && <p className="payment-history-loading">Loading orders…</p>}
        {error && <p className="payment-history-error" role="alert">{error}</p>}

        {!loading && !error && rows.length === 0 && (
          <p className="payment-history-empty">No orders yet. Subscriptions and credit purchases will appear here.</p>
        )}

        {!loading && rows.length > 0 && (
          <div className="payment-history-table-wrap glass-panel">
            <table className="payment-history-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th>Reference</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const statusLabel = formatPaymentOrderStatus(row.displayStatus, row.status);
                  return (
                    <tr key={row.orderReference}>
                      <td>
                        {row.planName}
                        {row.test ? <small className="payment-history-test">Test</small> : null}
                      </td>
                      <td>
                        {Number(row.amount).toFixed(row.currency === 'UAH' ? 0 : 2)} {row.currency}
                      </td>
                      <td>
                        <span className={`payment-history-status payment-history-status--${paymentStatusClass(row.displayStatus, row.status)}`}>
                          {statusLabel}
                        </span>
                      </td>
                      <td>{row.paidAt || row.createdAt || '—'}</td>
                      <td><code>{row.orderReference}</code></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
