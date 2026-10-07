import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import apiClient from '../../lib/apiClient';
import './Checkout.css';
import './CheckoutProduction.css';
import { AllModelAILogoMark } from '../AllModelAILogo/AllModelAILogo';
import { fetchCheckoutInfo, fetchCheckoutPlan, TEST_MODE_BANNER } from '../../lib/paymentCheckoutInfo';
import { runTestWayforpayCheckout, submitWayforpayCheckout } from '../../lib/wayforpay';
import { useSession } from '../Session/SessionProvider';
import StripePlanCheckout from './StripePlanCheckout';
import { IconCheck, IconLock, IconShield } from './CheckoutIcons';

const DEVELOPER_FALLBACK = {
  slug: 'developer',
  name: 'Developer',
  amountDisplay: '0.00',
  interval: 'month',
  requestLimit: 5000,
  features: [
    'All AI providers',
    '5,000 requests each month',
    'Code Studio and Live Preview',
  ],
};

function planSlugFromPath(pathname) {
  if (pathname.endsWith('/enterprise')) return 'enterprise';
  if (pathname.endsWith('/pro')) return 'pro';
  if (pathname.endsWith('/developer')) return 'developer';
  return 'pro';
}

export default function Checkout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { status: sessionStatus } = useSession();
  const planSlug = useMemo(() => {
    const fromQuery = searchParams.get('plan');
    if (fromQuery === 'developer') return 'developer';
    if (location.pathname.endsWith('/enterprise')) return 'enterprise';
    if (location.pathname.endsWith('/pro')) return 'pro';
    if (fromQuery === 'enterprise' || fromQuery === 'plus') return 'enterprise';
    if (fromQuery === 'pro' || fromQuery === 'common') return 'pro';
    return planSlugFromPath(location.pathname);
  }, [location.pathname, searchParams]);
  const isDeveloper = planSlug === 'developer';

  const [checkoutInfo, setCheckoutInfo] = useState(null);
  const [planQuote, setPlanQuote] = useState(null);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [error, setError] = useState('');
  const [stripePublishableKey, setStripePublishableKey] = useState('');
  const [stripeClientSecret, setStripeClientSecret] = useState('');
  const [stripeReady, setStripeReady] = useState(false);

  const paymentProvider = checkoutInfo?.primaryProvider || null;
  const showTestBanner = Boolean(checkoutInfo?.showTestModeBanner);
  const paymentsAvailable = Boolean(checkoutInfo?.checkoutAvailable);
  const providerLabel = checkoutInfo?.providerDisplayName || 'Payment provider';
  const secureLabel = checkoutInfo?.secureCheckoutLabel || 'Secure payment';

  const summary = isDeveloper ? DEVELOPER_FALLBACK : planQuote;
  const priceLabel = summary
    ? (Number(summary.amountDisplay) === 0 ? '$0' : `$${summary.amountDisplay}`)
    : '—';

  useEffect(() => {
    fetchCheckoutInfo().then(setCheckoutInfo);
  }, []);

  useEffect(() => {
    if (isDeveloper) {
      setPlanQuote(null);
      return undefined;
    }
    let cancelled = false;
    fetchCheckoutPlan(planSlug)
      .then((data) => { if (!cancelled) setPlanQuote(data); })
      .catch((failure) => { if (!cancelled) setError(failure.message); });
    return () => { cancelled = true; };
  }, [planSlug, isDeveloper]);

  useEffect(() => {
    if (isDeveloper) return undefined;
    if (sessionStatus === 'restoring-session' || sessionStatus === 'checking-redirect') return undefined;
    if (sessionStatus === 'authenticated') return undefined;
    const returnPath = location.pathname || '/checkout/pro';
    navigate('/login', { replace: true, state: { from: returnPath } });
    return undefined;
  }, [sessionStatus, isDeveloper, navigate, location.pathname]);

  const checkoutReturnUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}/checkout/success?plan=${encodeURIComponent(planSlug)}`;
  }, [planSlug]);

  const activateDeveloperPlan = async () => {
    setCheckoutBusy(true);
    setError('');
    try {
      const response = await apiClient.post('/api/payments/checkout', { plan: 'developer' });
      if (response.data.developerAccess) {
        navigate('/checkout/success?plan=developer', { replace: true });
        return;
      }
      throw new Error('Developer activation failed.');
    } catch (requestError) {
      setError(requestError.response?.data?.message || requestError.message || 'Could not activate developer access.');
      if (requestError.response?.status === 401) {
        navigate('/login', { state: { from: '/checkout?plan=developer' } });
      }
    } finally {
      setCheckoutBusy(false);
    }
  };

  const startStripeCheckout = useCallback(async () => {
    setCheckoutBusy(true);
    setError('');
    setStripeClientSecret('');
    setStripePublishableKey('');
    setStripeReady(false);
    try {
      const response = await apiClient.post('/api/payments/create-intent', { plan: planSlug });
      let publishableKey = String(response.data.publishableKey || '').trim();
      if (!publishableKey) {
        const configRes = await apiClient.get('/api/payments/config');
        publishableKey = String(configRes.data.publishableKey || '').trim();
      }
      if (!publishableKey || !response.data.clientSecret) {
        throw new Error('Secure checkout could not be started.');
      }
      if (publishableKey.startsWith('pk_live_') && checkoutInfo?.paymentMode === 'test') {
        throw new Error('Live payment keys cannot be used in test mode.');
      }
      setStripePublishableKey(publishableKey);
      setStripeClientSecret(response.data.clientSecret);
      setStripeReady(true);
    } catch (requestError) {
      const message = requestError.response?.data?.message || requestError.message || 'Could not start secure checkout.';
      setError(message);
    } finally {
      setCheckoutBusy(false);
    }
  }, [planSlug, checkoutInfo?.paymentMode]);

  const startWayforpayCheckout = async () => {
    setCheckoutBusy(true);
    setError('');
    try {
      if (checkoutInfo?.wayforpayMockCheckout) {
        const result = await runTestWayforpayCheckout(apiClient, planSlug);
        navigate(`/checkout/success?plan=${encodeURIComponent(planSlug)}&orderReference=${encodeURIComponent(result.orderReference)}`, { replace: true });
        return;
      }
      const response = await apiClient.post('/api/payments/wayforpay/create', { plan: planSlug });
      if (response.data.mockCheckout) {
        throw new Error('Unexpected test response. Refresh and try again.');
      }
      submitWayforpayCheckout(response.data);
    } catch (requestError) {
      setError(requestError.response?.data?.message || requestError.message || 'Payment could not be started.');
    } finally {
      setCheckoutBusy(false);
    }
  };

  const handleContinueToPayment = async () => {
    if (!paymentsAvailable) return;
    if (paymentProvider === 'stripe') {
      await startStripeCheckout();
      return;
    }
    if (paymentProvider === 'wayforpay') {
      await startWayforpayCheckout();
    }
  };

  const handleStripePaymentSuccess = (paymentIntentId) => {
    navigate(`/checkout/success?plan=${encodeURIComponent(planSlug)}&payment_intent=${encodeURIComponent(paymentIntentId)}`, { replace: true });
  };

  const canceled = location.pathname.endsWith('/cancel') || new URLSearchParams(location.search).get('canceled') === '1';

  return (
    <main className="checkout-page checkout-page--premium">
      <nav className="checkout-nav">
        <Link className="checkout-brand" to="/"><AllModelAILogoMark />AllModelAI</Link>
        <Link to="/dashboard">Dashboard</Link>
        <Link to="/pricing">Pricing</Link>
      </nav>

      {showTestBanner && (
        <p className="checkout-test-mode-banner checkout-test-mode-banner--prominent" role="status">{TEST_MODE_BANNER}</p>
      )}

      <section className="checkout-layout checkout-layout--pricing">
        <div className="checkout-intro">
          <p className="checkout-eyebrow">AllModelAI {summary?.name || (isDeveloper ? 'Developer' : 'Pro')}</p>
          <h1>{isDeveloper ? 'Developer access' : `Upgrade to ${summary?.name || 'Pro'}`}</h1>
          {!isDeveloper && summary && (
            <div className="checkout-plan checkout-plan--hero">
              <span>{summary.requestLimit?.toLocaleString?.() || summary.requestLimit} requests / {summary.interval}</span>
              <strong>{priceLabel}<small>/{summary.interval}</small></strong>
            </div>
          )}
          <ul className="checkout-summary-list checkout-summary-list--intro">
            {(summary?.features || []).map((perk) => (
              <li key={perk}><IconCheck className="checkout-feature-icon" />{perk}</li>
            ))}
          </ul>
        </div>

        <section className="checkout-form stripe-checkout-card checkout-payment-card">
          <div className="secure-row">
            <span>{secureLabel}</span>
            <small>{providerLabel}</small>
          </div>
          <h2>{isDeveloper ? 'Free developer plan' : 'Secure checkout'}</h2>

          {!isDeveloper && summary && (
            <div className="checkout-order-summary">
              <div>
                <span>Order summary</span>
                <strong>AllModelAI {summary.name}</strong>
              </div>
              <strong>${summary.amountDisplay} / {summary.interval}</strong>
            </div>
          )}

          {!isDeveloper && (
            <dl className="checkout-meta-list">
              <div><dt>Billing</dt><dd>Monthly</dd></div>
              <div><dt>Payment provider</dt><dd>{providerLabel}</dd></div>
            </dl>
          )}

          {isDeveloper && (
            <p className="developer-access-note">
              Developer access is free for emails listed in server configuration. No card required.
            </p>
          )}

          {canceled && (
            <div className="checkout-state checkout-state--cancel" role="status">
              <p>Payment wasn&apos;t completed.</p>
              <p className="checkout-state-sub">Your account was not charged.</p>
            </div>
          )}

          {!paymentsAvailable && !isDeveloper && (
            <div className="checkout-state checkout-state--unavailable" role="alert">
              <p>{checkoutInfo?.checkoutUnavailableMessage || 'Payments are temporarily unavailable.'}</p>
            </div>
          )}

          {error && (
            <p className="checkout-error" role="alert">{error}</p>
          )}

          {isDeveloper && (
            <button className="pay-button" type="button" disabled={checkoutBusy} onClick={activateDeveloperPlan}>
              {checkoutBusy ? 'Activating…' : 'Activate developer access'}
            </button>
          )}

          {!isDeveloper && paymentsAvailable && paymentProvider === 'stripe' && !stripeReady && (
            <button className="pay-button" type="button" disabled={checkoutBusy || sessionStatus !== 'authenticated'} onClick={handleContinueToPayment}>
              {checkoutBusy ? 'Preparing…' : 'Continue to secure payment'}
            </button>
          )}

          {!isDeveloper && paymentsAvailable && paymentProvider === 'wayforpay' && (
            <button className="pay-button" type="button" disabled={checkoutBusy || sessionStatus !== 'authenticated'} onClick={handleContinueToPayment}>
              {checkoutBusy ? 'Processing…' : 'Continue to secure payment'}
            </button>
          )}

          {!isDeveloper && paymentProvider === 'stripe' && stripeReady && stripeClientSecret && stripePublishableKey && (
            <>
              <StripePlanCheckout
                publishableKey={stripePublishableKey}
                clientSecret={stripeClientSecret}
                returnUrl={checkoutReturnUrl}
                payLabel={`Pay $${summary?.amountDisplay || ''}`}
                processingLabel="Processing payment…"
                onSuccess={handleStripePaymentSuccess}
                onError={(message) => setError(message || 'Payment could not be completed.')}
              />
              {checkoutInfo?.showStripeTestCardHint && (
                <div className="checkout-dev-test-card" role="note">
                  <strong>Stripe test card</strong>
                  <span>4242 4242 4242 4242</span>
                  <span>Any future expiry · Any CVC</span>
                </div>
              )}
            </>
          )}

          <ul className="checkout-trust-list">
            <li><IconLock className="checkout-trust-icon" /> Secure encrypted checkout</li>
            <li><IconShield className="checkout-trust-icon" /> Cancel anytime</li>
            <li>Subscription activates after payment confirmation</li>
          </ul>

          {!isDeveloper && canceled && (
            <button type="button" className="checkout-link-button" onClick={() => navigate(`/checkout/${planSlug}`)}>
              Try again
            </button>
          )}

          <small className="checkout-disclaimer">
            Your plan activates only after the payment provider confirms the transaction on AllModelAI servers.
          </small>
        </section>
      </section>
    </main>
  );
}
