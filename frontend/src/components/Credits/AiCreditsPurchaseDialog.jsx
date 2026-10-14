import { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../lib/api';
import './CreditsWallet.css';

export default function AiCreditsPurchaseDialog({ open, onClose, t = (s) => s }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  const startCheckout = async (packageId) => {
    setBusy(true);
    setError('');
    try {
      const response = await apiFetch('/api/payments/credit-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message || data.userMessage || t('Could not start checkout.'));
      }
      if (data.checkoutUrl) {
        window.location.assign(data.checkoutUrl);
        return;
      }
      throw new Error(t('Payment provider did not return a checkout page.'));
    } catch (checkoutError) {
      setError(checkoutError.message || t('Checkout failed.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="feature-modal-backdrop credits-modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="feature-modal credits-purchase-dialog"
        role="dialog"
        aria-labelledby="ai-credits-purchase-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="credits-modal-close" onClick={onClose} aria-label={t('Close')}>×</button>
        <h2 id="ai-credits-purchase-title">{t('AI credits needed')}</h2>
        <p className="credits-purchase-lead">
          {t('Your prepaid balance is empty. Buy credits to continue this chat — your messages stay here.')}
        </p>
        <p className="credits-purchase-note">
          {t('One-time Stripe Checkout only. We never save your card or charge automatically.')}
        </p>
        {error ? <p className="credits-purchase-error" role="alert">{error}</p> : null}
        <div className="credits-purchase-actions">
          <Link to="/credits" className="credits-btn credits-btn-secondary" onClick={onClose}>
            {t('View packages')}
          </Link>
          <button type="button" className="credits-btn credits-btn-primary" disabled={busy} onClick={() => startCheckout('starter')}>
            {busy ? t('Opening checkout…') : t('Buy Starter credits')}
          </button>
        </div>
      </section>
    </div>
  );
}
