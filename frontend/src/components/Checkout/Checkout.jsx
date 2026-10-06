import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import apiClient from '../../lib/apiClient';
import './Checkout.css';
import './CheckoutDemo.css';
import './CheckoutProduction.css';
import { AllModelAILogoMark } from '../AllModelAILogo/AllModelAILogo';
import { buildClientTestCheckoutInfo, fetchCheckoutInfo, TEST_MODE_BANNER } from '../../lib/paymentCheckoutInfo';
import { apiFetch } from '../../lib/api';
import { pollWayforpayPaymentStatus, submitWayforpayCheckout } from '../../lib/wayforpay';
import { useSession } from '../Session/SessionProvider';
import StripePlanCheckout from './StripePlanCheckout';

const plans = {
  developer: { key: 'developer', name: 'Developer', price: 0, interval: 'month', limit: '5,000', badge: 'FREE FOR DEVELOPERS', models: 'All models', perks: ['All AI providers', '5,000 requests each month', 'Code Studio and Live Preview'] },
  week: { key: 'week', name: 'Weekly', price: 5.99, interval: 'week', limit: '500', badge: 'FLEXIBLE', models: '6 core models', perks: ['Gemini, GPT, Llama and DeepSeek', '500 requests each week', 'Cancel anytime'] },
  common: { key: 'common', name: 'Pro', price: 19, interval: 'month', limit: '3,000', badge: 'MOST POPULAR', models: 'All hosted models', perks: ['Perplexity, Kimi, Claude and more', '3,000 requests each month', 'Priority model routing'] },
  plus: { key: 'plus', name: 'Enterprise', price: 49, interval: 'month', limit: '12,000', badge: 'POWER', models: 'All models', perks: ['Every connected provider', '12,000 requests each month', 'Arena, workflows and analytics'] },
};

const aliases = { starter: 'developer', free: 'developer', pro: 'common', monthly: 'common', enterprise: 'plus', power: 'plus' };

const checkoutSlugForPlanKey = (planKey) => {
  if (planKey === 'plus') return 'enterprise';
  if (planKey === 'common') return 'pro';
  return planKey;
};

export default function Checkout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { status: sessionStatus } = useSession();
  const initial = aliases[searchParams.get('plan')] || searchParams.get('plan') || 'common';
  const [selectedPlan, setSelectedPlan] = useState(plans[initial] ? initial : 'common');
  const [checkoutInfo, setCheckoutInfo] = useState(() => buildClientTestCheckoutInfo());
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [error, setError] = useState('');
  const [purchase, setPurchase] = useState(() => (searchParams.get('success') === 'developer' ? { plan: 'developer' } : null));
  const [stripePublishableKey, setStripePublishableKey] = useState('');
  const [stripeClientSecret, setStripeClientSecret] = useState('');
  const [stripeSessionLoading, setStripeSessionLoading] = useState(false);
  const [verifiedStripeTest, setVerifiedStripeTest] = useState(false);

  const summary = useMemo(() => plans[selectedPlan], [selectedPlan]);
  const testBannerText = checkoutInfo?.testModeBannerText || TEST_MODE_BANNER;
  const showTestBanner = Boolean(checkoutInfo?.showTestModeBanner);
  const showStripeTestCardHint = Boolean(checkoutInfo?.showStripeTestCardHint);
  const useStripeEmbedded = summary.price > 0
    && checkoutInfo?.primaryProvider === 'stripe'
    && checkoutInfo?.stripeCheckoutEnabled;
  const isMockWayforpay = Boolean(checkoutInfo?.wayforpayMockCheckout);
  const providerLabel = checkoutInfo?.checkoutSecureLabel || 'CHECKOUT';

  const checkoutPlanSlug = useMemo(() => checkoutSlugForPlanKey(selectedPlan), [selectedPlan]);

  const checkoutReturnUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    const origin = window.location.origin;
    return `${origin}/checkout/success?plan=${encodeURIComponent(checkoutPlanSlug)}`;
  }, [checkoutPlanSlug]);

  useEffect(() => {
    fetchCheckoutInfo().then(setCheckoutInfo);
  }, []);

  useEffect(() => {
    if (location.pathname.endsWith('/pro')) {
      setSelectedPlan('common');
      return;
    }
    if (location.pathname.endsWith('/enterprise')) {
      setSelectedPlan('plus');
      return;
    }
    const planFromUrl = searchParams.get('plan');
    if (!planFromUrl) return;
    const resolved = aliases[planFromUrl] || planFromUrl;
    if (plans[resolved]) setSelectedPlan(resolved);
  }, [searchParams, location.pathname]);

  useEffect(() => {
    if (summary.price <= 0) return undefined;
    if (sessionStatus === 'restoring-session' || sessionStatus === 'checking-redirect') return undefined;
    if (sessionStatus === 'authenticated') return undefined;
    const returnPath = `${location.pathname}${location.search}` || `/checkout?plan=${searchParams.get('plan') || 'pro'}`;
    navigate('/login', { replace: true, state: { from: returnPath } });
    return undefined;
  }, [sessionStatus, summary.price, navigate, searchParams, selectedPlan, location.pathname, location.search]);

  useEffect(() => {
    const sessionId = searchParams.get('session_id');
    if (searchParams.get('success') === 'developer') return undefined;
    if (!sessionId || searchParams.get('success') !== '1') return undefined;

    setCheckoutBusy(true);
    apiClient.get(`/api/payments/session/${encodeURIComponent(sessionId)}`)
      .then((response) => {
        setPurchase(response.data.purchase);
        setVerifiedStripeTest(Boolean(response.data.purchase?.isTestPayment ?? checkoutInfo?.stripeTestMode));
      })
      .catch((requestError) => {
        setError(requestError.response?.data?.message || 'Your test payment could not be verified. Please try again.');
      })
      .finally(() => setCheckoutBusy(false));
    return undefined;
  }, [searchParams, checkoutInfo?.stripeTestMode]);

  useEffect(() => {
    const orderReference = searchParams.get('orderReference');
    if (searchParams.get('wayforpay') !== 'return' || !orderReference) return undefined;

    let cancelled = false;
    (async () => {
      try {
        const paid = await pollWayforpayPaymentStatus(apiFetch, orderReference);
        if (cancelled) return;
        if (!paid?.paid) throw new Error('Payment confirmation is still pending.');
        setPurchase({ plan: paid.plan || selectedPlan, orderReference });
      } catch (requestError) {
        if (!cancelled) setError(requestError.message || 'Payment confirmation is still pending.');
      } finally {
        if (!cancelled) {
          setCheckoutBusy(false);
          navigate('/checkout', { replace: true });
        }
      }
    })();

    return () => { cancelled = true; };
  }, [searchParams, navigate, selectedPlan]);

  const handleStripePaymentSuccess = useCallback((paymentIntentId) => {
    navigate(`/checkout/success?plan=${encodeURIComponent(checkoutPlanSlug)}&payment_intent=${encodeURIComponent(paymentIntentId)}`, { replace: true });
  }, [navigate, checkoutPlanSlug]);

  const loadStripePaymentIntent = useCallback(async () => {
    if (!useStripeEmbedded || sessionStatus !== 'authenticated') return;
    setStripeSessionLoading(true);
    setError('');
    setStripeClientSecret('');
    setStripePublishableKey('');
    try {
      const response = await apiClient.post('/api/payments/create-intent', { plan: checkoutPlanSlug });
      let publishableKey = String(response.data.publishableKey || '').trim();
      if (!publishableKey) {
        const configRes = await apiClient.get('/api/payments/config');
        publishableKey = String(configRes.data.publishableKey || import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '').trim();
      }
      if (!publishableKey) {
        throw new Error('Missing STRIPE_PUBLISHABLE_KEY or VITE_STRIPE_PUBLISHABLE_KEY.');
      }
      if (publishableKey.startsWith('pk_live_') && checkoutInfo?.stripeTestMode) {
        throw new Error('Live Stripe payments are disabled in development.');
      }
      if (!response.data.clientSecret) {
        throw new Error('Could not start secure Stripe checkout.');
      }
      setStripePublishableKey(publishableKey);
      setStripeClientSecret(response.data.clientSecret);
    } catch (requestError) {
      const message = requestError.response?.data?.message
        || requestError.message
        || 'Could not load the payment form.';
      const code = requestError.response?.data?.code;
      if (requestError.response?.status === 503 || code === 'STRIPE_NOT_CONFIGURED') {
        setError(`Stripe Test Mode is not configured. ${message}`);
      } else {
        setError(message.includes('card') ? message : `Payment could not be completed. ${message}`);
      }
    } finally {
      setStripeSessionLoading(false);
    }
  }, [useStripeEmbedded, sessionStatus, checkoutPlanSlug, checkoutInfo?.stripeTestMode]);

  useEffect(() => {
    loadStripePaymentIntent();
  }, [loadStripePaymentIntent]);

  const runLiveWayforpayCheckout = async (planKey) => {
    const response = await apiClient.post('/api/payments/wayforpay/create', { plan: planKey });
    if (response.data.mockCheckout || response.data.testMode) {
      throw new Error('Unexpected test checkout response. Refresh the page and try again.');
    }
    submitWayforpayCheckout(response.data);
  };

  const activateDeveloperPlan = async () => {
    setCheckoutBusy(true);
    setError('');
    try {
      const response = await apiClient.post('/api/payments/checkout', { plan: 'developer' });
      if (response.data.developerAccess) {
        setPurchase(response.data.purchase || { plan: 'developer' });
        return;
      }
      throw new Error('Developer activation failed.');
    } catch (requestError) {
      const message = requestError.response?.data?.message || requestError.message || 'Could not activate developer access.';
      setError(message);
      if (requestError.response?.status === 401) {
        navigate('/login', { state: { from: '/checkout?plan=developer' } });
      }
    } finally {
      setCheckoutBusy(false);
    }
  };

  const beginLegacyCheckout = async () => {
    setCheckoutBusy(true);
    setError('');
    try {
      const response = await apiClient.post('/api/payments/checkout', { plan: selectedPlan });
      if (response.data.useWayforpay) {
        await runLiveWayforpayCheckout(selectedPlan);
        return;
      }
      if (!response.data.checkoutUrl) throw new Error('Payment provider did not return a checkout page.');
      window.location.assign(response.data.checkoutUrl);
    } catch (requestError) {
      setError(requestError.response?.data?.message || requestError.message || 'Could not start secure checkout.');
    } finally {
      setCheckoutBusy(false);
    }
  };

  if (purchase) {
    const planLabel = summary.name || 'AllModelAI';
    const isTestSuccess = verifiedStripeTest || showTestBanner || checkoutInfo?.stripeTestMode;
    return (
      <main className="checkout-page purchase-success-page">
        <nav className="checkout-nav">
          <Link className="checkout-brand" to="/"><AllModelAILogoMark />AllModelAI</Link>
        </nav>
        <p className="checkout-eyebrow">{isTestSuccess ? 'Test payment' : 'Access activated'}</p>
        <div className="success-mark" aria-hidden="true">&#10003;</div>
        <h1>Thanks for your purchase!</h1>
        <p className="checkout-success">
          Your AllModelAI {planLabel} {isTestSuccess ? 'test purchase' : 'subscription'} was successful.
        </p>
        {isTestSuccess && (
          <p className="checkout-test-mode-inline checkout-success-test-note" role="status">
            TEST MODE — No real money was charged.
          </p>
        )}
        <button type="button" className="pay-button checkout-continue-btn" onClick={() => navigate('/dashboard', { replace: true })}>
          Continue to AllModelAI
        </button>
      </main>
    );
  }

  const payLabel = `Pay $${summary.price}`;

  return (
    <main className="checkout-page">
      <nav className="checkout-nav">
        <Link className="checkout-brand" to="/"><AllModelAILogoMark />AllModelAI</Link>
        <Link to="/dashboard">Dashboard</Link>
        <Link to="/login">Login</Link>
      </nav>
      {showTestBanner && (
        <p className="checkout-test-mode-banner checkout-test-mode-banner--prominent" role="status">{testBannerText}</p>
      )}
      <section className="checkout-layout checkout-layout--pricing">
        <div className="checkout-intro">
          <p className="checkout-eyebrow">AllModelAI Secure Checkout</p>
          <h1>Upgrade to {summary.name}</h1>
          <p>
            Complete your subscription on Stripe&apos;s secure form. AllModelAI never receives your card number or CVC.
          </p>
          {summary.price > 0 && (
            <div className="checkout-plan checkout-plan--hero">
              <span>{summary.limit} requests / {summary.interval}</span>
              <strong>${summary.price}<small>/{summary.interval}</small></strong>
            </div>
          )}
          <ul className="checkout-summary-list checkout-summary-list--intro">
            {summary.perks.map((perk) => <li key={perk}>{perk}</li>)}
          </ul>
        </div>
        <section className="checkout-form stripe-checkout-card">
          <div className="secure-row">
            <span>{providerLabel}</span>
            <small>{useStripeEmbedded ? 'Stripe Payment Element' : 'Encrypted payment'}</small>
          </div>
          <h2>{summary.price > 0 ? `AllModelAI ${summary.name}` : 'Developer access'}</h2>
          {summary.price > 0 && (
            <div className="checkout-order-summary">
              <span>Order summary</span>
              <strong>${summary.price} / {summary.interval}</strong>
            </div>
          )}
          {selectedPlan === 'developer' && (
            <p className="developer-access-note">
              Developer access is free for emails listed in <code>DEVELOPER_EMAILS</code>. No card required.
            </p>
          )}
          {searchParams.get('canceled') && (
            <p className="checkout-error">Checkout was canceled. Nothing was charged.</p>
          )}
          {error && (
            <p className="checkout-error" role="alert">
              {error.includes('card') ? error : `Your test payment could not be completed. ${error}`}
            </p>
          )}
          {checkoutInfo?.stripeCheckoutBlocked && (
            <p className="checkout-error" role="alert">{checkoutInfo.stripeCheckoutBlockedMessage}</p>
          )}

          {summary.price <= 0 && (
            <button className="pay-button" type="button" disabled={checkoutBusy} onClick={activateDeveloperPlan}>
              {checkoutBusy ? 'Activating…' : 'Activate developer access'}
            </button>
          )}

          {summary.price > 0 && useStripeEmbedded && (
            <>
              {stripeSessionLoading && !stripeClientSecret && (
                <p className="checkout-stripe-loading" role="status">Preparing secure payment…</p>
              )}
              {stripeClientSecret && stripePublishableKey && (
                <StripePlanCheckout
                  publishableKey={stripePublishableKey}
                  clientSecret={stripeClientSecret}
                  returnUrl={checkoutReturnUrl}
                  payLabel={payLabel}
                  onSuccess={handleStripePaymentSuccess}
                  onError={(message) => setError(message || 'Please check your Stripe test card information and try again.')}
                />
              )}
              {showStripeTestCardHint && (
                <div className="checkout-dev-test-card" role="note">
                  <strong>TEST CARD</strong>
                  <span>4242 4242 4242 4242</span>
                  <span>EXP: 12/34 · CVC: 123</span>
                </div>
              )}
            </>
          )}

          {summary.price > 0 && !useStripeEmbedded && !isMockWayforpay && (
            <button className="pay-button" type="button" disabled={checkoutBusy} onClick={beginLegacyCheckout}>
              {checkoutBusy ? 'Processing…' : `Continue to payment · $${summary.price}/${summary.interval}`}
            </button>
          )}

          {summary.price > 0 && isMockWayforpay && !useStripeEmbedded && (
            <p className="checkout-error" role="alert">
              Configure Stripe test keys (STRIPE_MODE=test) to use the embedded Stripe checkout for Pro and Enterprise.
            </p>
          )}

          <small className="checkout-disclaimer">
            {useStripeEmbedded
              ? 'Your plan activates only after Stripe confirms payment (return URL + server verification + webhook).'
              : 'Your plan activates only after the payment provider confirms the transaction on the server.'}
          </small>
        </section>
      </section>
    </main>
  );
}
