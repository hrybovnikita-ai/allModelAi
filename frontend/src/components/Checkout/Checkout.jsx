import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import apiClient from '../../lib/apiClient';
import './Checkout.css';
import './CheckoutProduction.css';
import './CheckoutDemo.css';
import './CheckoutPremium.css';
import { AllModelAILogoMark } from '../AllModelAILogo/AllModelAILogo';
import { fetchCheckoutInfo, fetchCheckoutPlan, TEST_MODE_BANNER } from '../../lib/paymentCheckoutInfo';
import { runTestWayforpayCheckout, submitWayforpayCheckout } from '../../lib/wayforpay';
import { useSession } from '../Session/SessionProvider';
import { isAuthInitializing } from '../../lib/authSessionStatus';
import ProductionStripeCheckoutForm from './ProductionStripeCheckoutForm';
import MockCheckoutForm from './MockCheckoutForm';
import CheckoutSummaryCard from './CheckoutSummaryCard';
import PaymentFormCard from './PaymentFormCard';
import PaymentButton from './PaymentButton';
import CheckoutAiCreditPackages from './CheckoutAiCreditPackages';
import {
  openStripeBillingPortal,
  openStripeBillingPortalFromApiError,
  subscriptionMatchesCheckoutPlan,
} from '../../lib/stripeBillingPortal';

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
  const [canUseWayforpayTestCheckout, setCanUseWayforpayTestCheckout] = useState(false);
  const [activePlanConflict, setActivePlanConflict] = useState(null);
  const stripeAutoLoadRef = useRef(false);
  const paymentProvider = checkoutInfo?.primaryProvider || null;
  const paymentsAvailable = Boolean(checkoutInfo?.checkoutAvailable);
  const useStripeProduction = Boolean(paymentsAvailable && paymentProvider === 'stripe');
  const showTestBanner = Boolean(checkoutInfo?.showTestModeBanner)
    || (ownerTestCheckout && checkoutInfo?.wayforpayTestMode);
  const testBannerText = checkoutInfo?.testModeBannerText || TEST_MODE_BANNER;
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
        if (!cancelled) {
          setOwnerTestCheckout(Boolean(response.data?.canUseOwnerTestCheckout));
          setCanUseWayforpayTestCheckout(Boolean(response.data?.canUseWayforpayTestCheckout));
        }
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
    } catch (requestError) {
      const payload = requestError.response?.data;
      const portalAttempt = await openStripeBillingPortalFromApiError(requestError);
      if (portalAttempt.redirected) return;
      const message = portalAttempt.message || formatStripeConfigError(
        payload,
        payload?.userMessage || payload?.message || requestError.message || 'Could not start secure checkout.',
      );
      setError(message);
      if (requestError.response?.status === 409 && payload?.useBillingPortal) {
        setActivePlanConflict({
          canManageStripeBilling: Boolean(payload.canManageStripeBilling),
          billingManagementMessage: payload.billingManagementMessage || message,
        });
      }
    } finally {
      setCheckoutBusy(false);
    }
  }, [planSlug, checkoutInfo?.paymentMode]);

  useEffect(() => {
    stripeAutoLoadRef.current = false;
  }, [planSlug]);

  useEffect(() => {
    if (!useStripeProduction || isDeveloper) return undefined;
    if (isAuthInitializing(sessionStatus) || sessionStatus !== 'authenticated') return undefined;
    if (stripeReady || checkoutBusy || stripeAutoLoadRef.current) return undefined;

    let cancelled = false;
    (async () => {
      try {
        const { data: sub } = await apiClient.get('/api/subscription');
        if (cancelled) return;
        if (subscriptionMatchesCheckoutPlan(sub, planSlug)) {
          stripeAutoLoadRef.current = true;
          setActivePlanConflict({
            canManageStripeBilling: Boolean(sub.canManageStripeBilling),
            billingManagementMessage: sub.billingManagementMessage
              || 'You already have an active subscription on this plan.',
          });
          setError('');
          return;
        }
        stripeAutoLoadRef.current = true;
        await startStripeCheckout();
      } catch {
        if (!cancelled) {
          stripeAutoLoadRef.current = true;
          await startStripeCheckout();
        }
      }
    })();

    return () => { cancelled = true; };
  }, [
    useStripeProduction,
    isDeveloper,
    sessionStatus,
    stripeReady,
    checkoutBusy,
    startStripeCheckout,
    planSlug,
  ]);

  const wayforpayTestFlow = Boolean(
    checkoutInfo?.wayforpayTestMode
    && paymentProvider === 'wayforpay'
    && (canUseWayforpayTestCheckout || ownerTestCheckout),
  );

  const startWayforpayCheckout = async () => {
    setCheckoutBusy(true);
    setError('');
    try {
      if (checkoutInfo?.wayforpayTestMode && !canUseWayforpayTestCheckout && !ownerTestCheckout) {
        throw new Error('WayForPay test checkout is not available for this account in this environment.');
      }
      if (wayforpayTestFlow) {
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
      const payload = requestError.response?.data;
      setError(payload?.message || payload?.userMessage || requestError.message || 'Payment could not be started.');
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
    <main className={`checkout-page checkout-page--premium${useStripeProduction ? '' : ' checkout-page--mock'}`}>
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
        <p className="checkout-test-mode-banner checkout-test-mode-banner--prominent" role="status">{testBannerText}</p>
      )}

      <section className="checkout-layout checkout-layout--split">
        <CheckoutSummaryCard
          isDeveloper={isDeveloper}
          summary={summary}
          priceLabel={priceLabel}
          providerLabel={providerLabel}
        />

        <PaymentFormCard>
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

          {activePlanConflict && (
            <div className="checkout-state checkout-state--cancel" role="status">
              <p>{activePlanConflict.billingManagementMessage}</p>
              {activePlanConflict.canManageStripeBilling ? (
                <PaymentButton
                  type="button"
                  loading={checkoutBusy}
                  loadingLabel="Opening…"
                  onClick={() => {
                    setCheckoutBusy(true);
                    openStripeBillingPortal()
                      .catch((portalError) => {
                        setError(portalError.message || 'Could not open billing portal.');
                      })
                      .finally(() => setCheckoutBusy(false));
                  }}
                >
                  Manage subscription in Stripe
                </PaymentButton>
              ) : (
                <p className="checkout-state-sub">
                  Open Dashboard → Manage subscription for details, or contact support if you expected Stripe billing.
                </p>
              )}
            </div>
          )}

          {isDeveloper && (
            <>
              <h2>Free developer plan</h2>
              <p className="developer-access-note">
                Developer access is free for emails listed in server configuration. No card required.
              </p>
              <PaymentButton type="button" loading={checkoutBusy} loadingLabel="Activating…" onClick={activateDeveloperPlan}>
                Activate developer access
              </PaymentButton>
            </>
          )}

          {!isDeveloper && (
            <>
              {useStripeProduction && !activePlanConflict ? (
                <ProductionStripeCheckoutForm
                  publishableKey={stripePublishableKey}
                  clientSecret={stripeClientSecret}
                  returnUrl={stripeReturnUrl || checkoutReturnUrl}
                  defaultEmail={sessionUser?.email || ''}
                  disabled={!sessionReady}
                  stripeLoading={checkoutBusy && !stripeReady}
                  stripeLoadError={!checkoutBusy && !stripeReady && error ? error : ''}
                  onStripeError={(message) => setError(message || '')}
                  onRetryStripeLoad={() => {
                    stripeAutoLoadRef.current = false;
                    void startStripeCheckout();
                  }}
                  payLabel={`Subscribe — $${summary?.amountDisplay || ''} / month`}
                  processingLabel="Processing payment…"
                  showStripeTestCardHint={Boolean(checkoutInfo?.showStripeTestCardHint)}
                  showTestModeBanner={showTestBanner}
                  secureCheckoutLabel={checkoutInfo?.secureCheckoutLabel || 'Secure payment'}
                />
              ) : (
                <>
                  <MockCheckoutForm
                    planName={summary?.name || (planSlug === 'enterprise' ? 'Enterprise' : 'Pro')}
                    planSlug={planSlug}
                    priceLabel={priceLabel}
                    interval={summary?.interval || 'month'}
                    disabled={!sessionReady}
                    defaultEmail={sessionUser?.email || ''}
                    demoPreview={!paymentsAvailable}
                    testModeLabel={
                      showTestBanner
                        ? testBannerText
                        : 'Demo Preview — layout only, no payment processing'
                    }
                  />

                  {paymentProvider === 'wayforpay' && paymentsAvailable && (
                    <div className="checkout-wayforpay-alt checkout-wayforpay-alt--primary">
                      {wayforpayTestFlow && (
                        <p className="checkout-owner-test-note" role="status">
                          Simulated WayForPay test payment — no redirect, no real charge. Subscription activates only after server confirms the mock callback.
                        </p>
                      )}
                      <PaymentButton
                        type="button"
                        loading={checkoutBusy}
                        loadingLabel="Processing…"
                        disabled={!sessionReady || (checkoutInfo?.wayforpayTestMode && !canUseWayforpayTestCheckout && !ownerTestCheckout)}
                        onClick={() => { void startWayforpayCheckout(); }}
                      >
                        {wayforpayTestFlow ? 'Complete WayForPay test payment' : 'Continue with WayForPay'}
                      </PaymentButton>
                    </div>
                  )}
                </>
              )}

              {!sessionReady && !isAuthInitializing(sessionStatus) && (
                <p className="checkout-signin-hint" role="note">Sign in to complete subscription.</p>
              )}

              {checkoutInfo?.renewalNotice && (
                <p className="checkout-renewal-note" role="note">{checkoutInfo.renewalNotice}</p>
              )}

              {!useStripeProduction && paymentsAvailable && paymentProvider === 'wayforpay' && (
                <small className="checkout-disclaimer checkout-disclaimer--left checkout-disclaimer--premium">
                  WayForPay checkout opens on their secure page. Premium access is granted only after the server verifies payment.
                </small>
              )}

              {!paymentsAvailable && (
                <small className="checkout-disclaimer checkout-disclaimer--left checkout-disclaimer--premium">
                  Demo Preview mode — card fields are visual only and never activate a subscription.
                </small>
              )}
            </>
          )}

          {!isDeveloper && canceled && (
            <button type="button" className="checkout-link-button" onClick={() => navigate(`/checkout/${planSlug}`)}>
              Try again
            </button>
          )}
        </PaymentFormCard>
      </section>

      <CheckoutAiCreditPackages
        sessionReady={sessionReady}
        showTestBanner={showTestBanner}
        testBannerText={testBannerText}
      />
    </main>
  );
}
