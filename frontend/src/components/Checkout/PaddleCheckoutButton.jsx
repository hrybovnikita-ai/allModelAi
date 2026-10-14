import { useState } from 'react';
import apiClient from '../../lib/apiClient';
import { openPaddleCheckout } from '../../lib/paddleCheckout';
import PaymentButton from './PaymentButton';

export default function PaddleCheckoutButton({
  planSlug,
  disabled = false,
  paddleSandbox = true,
  label = 'Pay with Paddle',
  loadingLabel = 'Opening Paddle…',
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const startCheckout = async () => {
    if (disabled || busy) return;
    setBusy(true);
    setError('');
    try {
      const checkoutPlan = planSlug === 'enterprise' ? 'enterprise' : planSlug === 'pro' ? 'pro' : planSlug;
      const response = await apiClient.post('/api/payments/paddle/checkout', { plan: checkoutPlan });
      const { transactionId, paddleClientToken, paddleSandbox: sandboxFlag } = response.data;
      await openPaddleCheckout({
        clientToken: paddleClientToken,
        sandbox: sandboxFlag ?? paddleSandbox,
        transactionId,
      });
    } catch (requestError) {
      const payload = requestError.response?.data;
      setError(payload?.userMessage || payload?.message || requestError.message || 'Paddle checkout failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="checkout-paddle-alt">
      {error && <p className="checkout-error checkout-error--left" role="alert">{error}</p>}
      <PaymentButton type="button" loading={busy} loadingLabel={loadingLabel} disabled={disabled} onClick={() => { void startCheckout(); }}>
        {label}
      </PaymentButton>
    </div>
  );
}
