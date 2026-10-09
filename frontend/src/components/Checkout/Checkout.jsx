import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import apiClient from '../../lib/apiClient';
import './Checkout.css';
import './CheckoutProduction.css';
import './CheckoutDemo.css';
import { AllModelAILogoMark } from '../AllModelAILogo/AllModelAILogo';
import { fetchCheckoutInfo, fetchCheckoutPlan, TEST_MODE_BANNER } from '../../lib/paymentCheckoutInfo';
import { runTestWayforpayCheckout, submitWayforpayCheckout } from '../../lib/wayforpay';
import { useSession } from '../Session/SessionProvider';
import { isAuthInitializing } from '../../lib/authSessionStatus';
import StripeEmbeddedCheckout from './StripeEmbeddedCheckout';
import MockCheckoutForm from './MockCheckoutForm';
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
  const { status: sessionStatus, user: sessionUser } = useSession();
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
  const [ownerTestCheckout, setOwnerTestCheckout] = useState(false);
  const [stripePanelOpen, setStripePanelOpen] = useState(false);

  const paymentProvider = checkoutInfo?.primaryProvider || null;
  const showTestBanner = Boolean(checkoutInfo?.showTestModeBanner)
    || (ownerTestCheckout && checkoutInfo?.wayforpayTestMode);
  const paymentsAvailable = Boolean(checkoutInfo?.checkoutAvailable);
  const providerLabel = checkoutInfo?.providerDisplayName || 'Payment provider';

  const summary = isDeveloper ? DEVELOPER_FALLBACK : planQuote;
  const priceLabel = summary
    ? (Number(summary.amountDisplay) === 0 ? '$0' : `$${summary.amountDisplay}`)
    : '—';

  useEffect(() => {
    fetchCheckoutInfo().then(setCheckoutInfo);
  }, []);

  useEffect(() => {
    if (sessionStatus !== 'authenticated') {
      setOwnerTestCheckout(false);
      return undefined;
    }
    let cancelled = false;
    apiClient.get('/api/subscription')
      .then((response) => {
        if (!cancelled) setOwnerTestCheckout(Boolean(response.data?.canUseOwnerTestCheckout));
      })
      .catch(() => {
        if (!cancelled) setOwnerTestCheckout(false);
      });
    return () => { cancelled = true; };
  }, [sessionStatus]);

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
    if (isAuthInitializing(sessionStatus)) return undefined;
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

  const formatStripeConfigError = (payload, fallback) => {
    const missing = payload?.missingEnvVars;
    if (Array.isArray(missing) && missing.length) {
      return `${payload.message || fallback} Missing: ${missing.join(', ')}.`;
    }
    return payload?.message || fallback;
  };

  const startStripeCheckout = useCallback(async () => {
    setCheckoutBusy(true);
    setError('');
    setStripeClientSecret('');
    setStripePublishableKey('');
    setStripeReady(false);
    try {
      const checkoutPlan = planSlug === 'enterprise' ? 'enterprise' : planSlug === 'pro' ? 'pro' : planSlug;
      const response = await apiClient.post('/api/payments/checkout', {
        plan: checkoutPlan,
        embedded: true,
      });
      let publishableKey = String(response.data.publishableKey || '').trim();
      if (!publishableKey) {
        const configRes = await apiClient.get('/api/payments/config');
        publishableKey = String(configRes.data.publishableKey || '').trim();
      }
      if (!publishableKey || !response.data.clientSecret) {
        throw new Error(formatStripeConfigError(response.data, 'Secure checkout could not be started.'));
      }
      if (publishableKey.startsWith('pk_live_') && checkoutInfo?.paymentMode === 'test') {
        throw new Error('Live payment keys cannot be used in test mode.');
      }
      setStripePublishableKey(publishableKey);
      setStripeClientSecret(response.data.clientSecret);
      setStripeReady(true);
      setStripePanelOpen(true);
    } catch (requestError) {
      const message = formatStripeConfigError(
        requestError.response?.data,
        requestError.response?.data?.message || requestError.message || 'Could not start secure checkout.',
      );
      setError(message);
    } finally {
      setCheckoutBusy(false);
    }
  }, [planSlug, checkoutInfo?.paymentMode]);

  const wayforpaySandboxForOwner = Boolean(
    checkoutInfo?.wayforpayTestMode && ownerTestCheckout && paymentProvider === 'wayforpay',
  );

  const startWayforpayCheckout = async () => {
    setCheckoutBusy(true);
    setError('');
    try {
      if (checkoutInfo?.wayforpayTestMode && !ownerTestCheckout) {
        throw new Error('Paid checkout is unavailable in the test environment. Live WayForPay checkout activates when the server is configured for production payments.');
      }
      if (wayforpaySandboxForOwner) {
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

  const stripeReturnUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    const params = new URLSearchParams({
      plan: planSlug,
      session_id: '{CHECKOUT_SESSION_ID}',
    });
    return `${window.location.origin}/checkout/success?${params.toString()}`;
  }, [planSlug]);

  const canceled = location.pathname.endsWith('/cancel') || new URLSearchParams(location.search).get('canceled') === '1';
  const sessionReady = sessionStatus === 'authenticated';

  return (
    <main className="checkout-page checkout-page--premium checkout-page--mock">
      <header className="checkout-header">
        <nav className="checkout-nav checkout-nav--premium" aria-label="Checkout">
          <Link className="checkout-brand" to="/">
            <AllModelAILogoMark />
            <span>AllModelAI</span>
          </Link>
          <div className="checkout-nav-links">
            <Link to="/">Home</Link>
            <Link to="/pricing">Pricing</Link>
            <Link to="/dashboard">Dashboard</Link>
          </div>
        </nav>
      </header>

      {showTestBanner && (
        <p className="checkout-test-mode-banner checkout-test-mode-banner--prominent" role="status">{TEST_MODE_BANNER}</p>
      )}

      <section className="checkout-layout checkout-layout--split">
        <aside className="checkout-summary-panel glass-panel">
          <p className="checkout-eyebrow">Order summary</p>
          <h1>{isDeveloper ? 'Developer access' : `AllModelAI ${summary?.name || 'Pro'}`}</h1>
          {!isDeveloper && summary && (
            <>
              <div className="checkout-plan checkout-plan--hero checkout-plan--glass">
                <div>
                  <span className="checkout-plan-label">Selected plan</span>
                  <strong className="checkout-plan-name">{summary.name}</strong>
                </div>
                <div className="checkout-plan-price">
                  <strong>{priceLabel}</strong>
                  <small> / {summary.interval}</small>
                </div>
              </div>
              <p className="checkout-summary-requests">
                {summary.requestLimit?.toLocaleString?.() || summary.requestLimit} requests per {summary.interval}
              </p>
            </>
          )}
          <h2 className="checkout-summary-features-title">Included</h2>
          <ul className="checkout-summary-list checkout-summary-list--intro">
            {(summary?.features || []).map((perk) => (
              <li key={perk}><IconCheck className="checkout-feature-icon" />{perk}</li>
            ))}
          </ul>
          {!isDeveloper && (
            <dl className="checkout-meta-list checkout-meta-list--summary">
              <div><dt>Billing cycle</dt><dd>Monthly</dd></div>
              <div><dt>Provider</dt><dd>{providerLabel}</dd></div>
            </dl>
          )}
          <ul className="checkout-trust-list checkout-trust-list--summary">
            <li><IconLock className="checkout-trust-icon" /> Encrypted checkout</li>
            <li><IconShield className="checkout-trust-icon" /> Cancel anytime</li>
          </ul>
        </aside>

        <section className="checkout-form-panel glass-panel checkout-payment-card">
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
            <p className="checkout-error checkout-error--left" role="alert">{error}</p>
          )}

          {isDeveloper && (
            <>
              <h2>Free developer plan</h2>
              <p className="developer-access-note">
                Developer access is free for emails listed in server configuration. No card required.
              </p>
              <button className="pay-button" type="button" disabled={checkoutBusy} onClick={activateDeveloperPlan}>
                {checkoutBusy ? 'Activating…' : 'Activate developer access'}
              </button>
            </>
          )}

          {!isDeveloper && (
            <>
              <MockCheckoutForm
                planName={summary?.name || (planSlug === 'enterprise' ? 'Enterprise' : 'Pro')}
                planSlug={planSlug}
                priceLabel={priceLabel}
                interval={summary?.interval || 'month'}
                disabled={!sessionReady}
                defaultEmail={sessionUser?.email || ''}
                testModeLabel={showTestBanner ? TEST_MODE_BANNER : 'Demo checkout — use any test card details'}
              />

              {!sessionReady && !isAuthInitializing(sessionStatus) && (
                <p className="checkout-signin-hint" role="note">Sign in to complete subscription.</p>
              )}

              {paymentsAvailable && paymentProvider === 'stripe' && (
                <details
                  className="checkout-stripe-advanced"
                  open={stripePanelOpen}
                  onToggle={(event) => setStripePanelOpen(event.currentTarget.open)}
                >
                  <summary>Alternative: Stripe secure checkout</summary>
                  {!stripeReady ? (
                    <button
                      className="pay-button pay-button--secondary"
                      type="button"
                      disabled={checkoutBusy || !sessionReady}
                      onClick={() => { void startStripeCheckout(); }}
                    >
                      {checkoutBusy ? 'Preparing…' : 'Load Stripe payment form'}
                    </button>
                  ) : (
                    stripeClientSecret && stripePublishableKey && (
                      <>
                        <StripeEmbeddedCheckout
                          publishableKey={stripePublishableKey}
                          clientSecret={stripeClientSecret}
                          returnUrl={stripeReturnUrl || checkoutReturnUrl}
                          payLabel={`Subscribe · $${summary?.amountDisplay || ''} / month`}
                          processingLabel="Processing payment…"
                          onError={(message) => setError(message || 'Payment could not be completed.')}
                        />
                        {checkoutInfo?.showStripeTestCardHint && (
                          <div className="checkout-dev-test-card" role="note">
                            <strong>Stripe test mode</strong>
                            <span>4242 4242 4242 4242 · any future expiry · any CVC</span>
                          </div>
                        )}
                      </>
                    )
                  )}
                </details>
              )}

              {paymentsAvailable && paymentProvider === 'wayforpay' && (
                <div className="checkout-wayforpay-alt">
                  {wayforpaySandboxForOwner && (
                    <p className="checkout-owner-test-note" role="status">
                      Owner test payment — simulated WayForPay only. No real money will be charged.
                    </p>
                  )}
                  <button
                    className="pay-button pay-button--secondary"
                    type="button"
                    disabled={checkoutBusy || !sessionReady || (checkoutInfo?.wayforpayTestMode && !ownerTestCheckout)}
                    onClick={() => { void startWayforpayCheckout(); }}
                  >
                    {checkoutBusy ? 'Processing…' : (wayforpaySandboxForOwner ? 'Complete WayForPay test payment' : 'Continue with WayForPay')}
                  </button>
                </div>
              )}

              {checkoutInfo?.renewalNotice && (
                <p className="checkout-renewal-note" role="note">{checkoutInfo.renewalNotice}</p>
              )}

              <small className="checkout-disclaimer checkout-disclaimer--left">
                Demo checkout above does not charge your card. Live billing uses your configured payment provider after confirmation.
              </small>
            </>
          )}

          {!isDeveloper && canceled && (
            <button type="button" className="checkout-link-button" onClick={() => navigate(`/checkout/${planSlug}`)}>
              Try again
            </button>
          )}
        </section>
      </section>
    </main>
  );
}
