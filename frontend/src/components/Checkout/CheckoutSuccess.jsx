import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import apiClient from '../../lib/apiClient';
import { AllModelAILogoMark } from '../AllModelAILogo/AllModelAILogo';
import { fetchCheckoutInfo, fetchCheckoutPlan, TEST_MODE_BANNER } from '../../lib/paymentCheckoutInfo';
import { apiFetch } from '../../lib/api';
import { pollWayforpayPaymentStatus } from '../../lib/wayforpay';
import { useSession } from '../Session/SessionProvider';
import { isAuthInitializing } from '../../lib/authSessionStatus';
import { IconCheck } from './CheckoutIcons';
import './Checkout.css';
import './CheckoutProduction.css';

export default function CheckoutSuccess() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { status: sessionStatus } = useSession();
  const [phase, setPhase] = useState('confirming');
  const [error, setError] = useState('');
  const [testMode, setTestMode] = useState(false);
  const [planQuote, setPlanQuote] = useState(null);

  const planSlug = searchParams.get('plan') || 'pro';
  const intentId = searchParams.get('payment_intent') || searchParams.get('intent');
  const orderReference = searchParams.get('orderReference');
  const sessionId = searchParams.get('session_id');
  const isDeveloper = planSlug === 'developer';

  const returnPath = useMemo(() => {
    const params = new URLSearchParams(searchParams);
    return `/checkout/success?${params.toString()}`;
  }, [searchParams]);

  useEffect(() => {
    fetchCheckoutInfo().then((info) => {
      if (info?.showTestModeBanner) setTestMode(true);
    });
  }, []);

  useEffect(() => {
    if (isDeveloper) {
      setPhase('success');
      return undefined;
    }
    fetchCheckoutPlan(planSlug).then(setPlanQuote).catch(() => {});
    return undefined;
  }, [planSlug, isDeveloper]);

  useEffect(() => {
    if (isAuthInitializing(sessionStatus)) return undefined;
    if (sessionStatus !== 'authenticated') {
      navigate('/login', { replace: true, state: { from: returnPath } });
      return undefined;
    }

    if (isDeveloper) return undefined;

    let cancelled = false;

    (async () => {
      setPhase('confirming');
      setError('');
      try {
        if (intentId) {
          const response = await apiClient.get(`/api/payments/intent/${encodeURIComponent(intentId)}`);
          if (cancelled) return;
          setTestMode(Boolean(response.data.stripeTestMode || testMode));
          setPhase('success');
          return;
        }
        if (sessionId) {
          const response = await apiClient.get(`/api/payments/session/${encodeURIComponent(sessionId)}`);
          if (cancelled) return;
          setTestMode(Boolean(response.data.purchase?.isTestPayment ?? testMode));
          setPhase('success');
          return;
        }
        if (orderReference) {
          const paid = await pollWayforpayPaymentStatus(apiFetch, orderReference, { attempts: 8, intervalMs: 1500 });
          if (cancelled) return;
          if (!paid?.paid) throw new Error('Payment confirmation is still pending.');
          setTestMode(Boolean(paid.testMode ?? testMode));
          setPhase('success');
          return;
        }
        throw new Error('Missing payment confirmation. Return to checkout and try again.');
      } catch (requestError) {
        if (cancelled) return;
        const message = requestError.response?.data?.message || requestError.message || 'Your payment could not be verified.';
        if (/pending|processing|still/i.test(message)) {
          setPhase('pending');
        } else {
          setError(message);
          setPhase('failed');
        }
      }
    })();

    return () => { cancelled = true; };
  }, [sessionStatus, intentId, sessionId, orderReference, navigate, returnPath, isDeveloper]);

  const planName = isDeveloper ? 'Developer' : (planQuote?.name || (planSlug === 'enterprise' ? 'Enterprise' : 'Pro'));
  const billingLabel = planQuote ? `$${planQuote.amountDisplay} / ${planQuote.interval}` : null;

  return (
    <main className="checkout-page checkout-page--premium purchase-success-page">
      <nav className="checkout-nav">
        <Link className="checkout-brand" to="/"><AllModelAILogoMark />AllModelAI</Link>
      </nav>

      {phase === 'confirming' && (
        <p className="checkout-stripe-loading" role="status">We&apos;re confirming your subscription…</p>
      )}

      {phase === 'pending' && (
        <>
          <p className="checkout-eyebrow">Payment received</p>
          <h1>Confirming your subscription</h1>
          <p className="checkout-success">This usually takes a few seconds. You can open the dashboard — access updates automatically.</p>
          <button type="button" className="pay-button checkout-continue-btn" onClick={() => navigate('/dashboard', { replace: true })}>
            Open Dashboard
          </button>
        </>
      )}

      {phase === 'failed' && (
        <>
          <p className="checkout-eyebrow">Payment issue</p>
          <p className="checkout-error" role="alert">{error}</p>
          <button type="button" className="pay-button checkout-continue-btn" onClick={() => navigate(planSlug === 'enterprise' ? '/checkout/enterprise' : '/checkout/pro')}>
            Try again
          </button>
        </>
      )}

      {phase === 'success' && (
        <>
          <p className="checkout-eyebrow">{testMode ? 'Test payment successful' : 'Payment successful'}</p>
          <div className="success-mark success-mark--svg" aria-hidden="true"><IconCheck /></div>
          <h1>{isDeveloper ? 'Developer access active' : `AllModelAI ${planName} is active`}</h1>
          {!isDeveloper && (
            <dl className="checkout-meta-list checkout-meta-list--center">
              <div><dt>Your plan</dt><dd>{planName}</dd></div>
              {billingLabel && <div><dt>Billing</dt><dd>{billingLabel}</dd></div>}
            </dl>
          )}
          {testMode && (
            <p className="checkout-test-mode-inline checkout-success-test-note" role="status">{TEST_MODE_BANNER}</p>
          )}
          <button type="button" className="pay-button checkout-continue-btn" onClick={() => navigate('/dashboard', { replace: true })}>
            Go to Dashboard
          </button>
        </>
      )}
    </main>
  );
}
