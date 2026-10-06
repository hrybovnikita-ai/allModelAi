import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import apiClient from '../../lib/apiClient';
import { AllModelAILogoMark } from '../AllModelAILogo/AllModelAILogo';
import { fetchCheckoutInfo, TEST_MODE_BANNER } from '../../lib/paymentCheckoutInfo';
import { useSession } from '../Session/SessionProvider';
import './Checkout.css';
import './CheckoutProduction.css';

const PLAN_LABELS = {
  pro: 'Pro',
  enterprise: 'Enterprise',
  power: 'Enterprise',
  common: 'Pro',
  plus: 'Enterprise',
};

export default function CheckoutSuccess() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { status: sessionStatus } = useSession();
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [testMode, setTestMode] = useState(true);
  const planSlug = searchParams.get('plan') || 'pro';
  const planLabel = PLAN_LABELS[planSlug] || 'AllModelAI';
  const intentId = searchParams.get('payment_intent') || searchParams.get('intent');

  const returnPath = useMemo(
    () => `/checkout/success?plan=${encodeURIComponent(planSlug)}${intentId ? `&payment_intent=${encodeURIComponent(intentId)}` : ''}`,
    [planSlug, intentId],
  );

  useEffect(() => {
    if (sessionStatus === 'restoring-session' || sessionStatus === 'checking-redirect') return undefined;
    if (sessionStatus !== 'authenticated') {
      navigate('/login', { replace: true, state: { from: returnPath } });
      return undefined;
    }
    if (!intentId) {
      setError('Missing payment confirmation. Return to checkout and try again.');
      setBusy(false);
      return undefined;
    }
    setBusy(true);
    apiClient.get(`/api/payments/intent/${encodeURIComponent(intentId)}`)
      .then((response) => {
        setTestMode(Boolean(response.data.stripeTestMode));
      })
      .catch((requestError) => {
        setError(requestError.response?.data?.message || 'Your payment could not be verified on the server.');
      })
      .finally(() => setBusy(false));
    return undefined;
  }, [sessionStatus, intentId, navigate, returnPath]);

  useEffect(() => {
    fetchCheckoutInfo().then((info) => {
      if (info?.stripeTestMode) setTestMode(true);
    });
  }, []);

  return (
    <main className="checkout-page purchase-success-page">
      <nav className="checkout-nav">
        <Link className="checkout-brand" to="/"><AllModelAILogoMark />AllModelAI</Link>
      </nav>
      {busy && <p className="checkout-stripe-loading" role="status">Confirming your payment…</p>}
      {!busy && error && (
        <>
          <p className="checkout-error" role="alert">{error}</p>
          <button type="button" className="pay-button checkout-continue-btn" onClick={() => navigate(`/checkout/${planSlug === 'enterprise' || planSlug === 'plus' ? 'enterprise' : 'pro'}`)}>
            Back to checkout
          </button>
        </>
      )}
      {!busy && !error && (
        <>
          <p className="checkout-eyebrow">{testMode ? 'Test payment' : 'Access activated'}</p>
          <div className="success-mark" aria-hidden="true">&#10003;</div>
          <h1>Thanks for your purchase!</h1>
          <p className="checkout-success">
            Your AllModelAI {planLabel} {testMode ? 'test purchase' : 'subscription'} was successful.
          </p>
          {testMode && (
            <p className="checkout-test-mode-inline checkout-success-test-note" role="status">
              TEST MODE — No real money was charged.
            </p>
          )}
          <button type="button" className="pay-button checkout-continue-btn" onClick={() => navigate('/dashboard', { replace: true })}>
            Continue to AllModelAI
          </button>
        </>
      )}
      {testMode && !error && (
        <p className="checkout-test-mode-banner checkout-test-mode-banner--prominent" role="status">{TEST_MODE_BANNER}</p>
      )}
    </main>
  );
}
