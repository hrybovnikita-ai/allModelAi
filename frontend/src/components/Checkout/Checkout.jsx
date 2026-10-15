import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import apiClient from '../../lib/apiClient';
import './Checkout.css';
import './CheckoutProduction.css';
import './CheckoutDemo.css';
import './CheckoutPremium.css';
import './CheckoutStripeLayout.css';
import { AllModelAILogoMark } from '../AllModelAILogo/AllModelAILogo';
import { fetchCheckoutInfo, fetchCheckoutPlan, TEST_MODE_BANNER } from '../../lib/paymentCheckoutInfo';
import { DEFAULT_WAYFORPAY_CURRENCIES } from '../../lib/wayforpay';
import WayforpayPaymentModal from './WayforpayPaymentModal';
import { useSession } from '../Session/SessionProvider';
import { isAuthInitializing } from '../../lib/authSessionStatus';
import ProductionStripeCheckoutForm from './ProductionStripeCheckoutForm';
import MockCheckoutForm from './MockCheckoutForm';
import CheckoutSummaryCard from './CheckoutSummaryCard';
import PaymentFormCard from './PaymentFormCard';
import PaymentButton from './PaymentButton';
import CheckoutAiCreditPackages from './CheckoutAiCreditPackages';
import PaddleCheckoutButton from './PaddleCheckoutButton';
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
  if (pathname.endsWith('/enterprise') || pathname.endsWith('/unlimited')) return 'unlimited';
  if (pathname.endsWith('/starter')) return 'starter';
  if (pathname.endsWith('/pro')) return 'pro';
  if (pathname.endsWith('/developer')) return 'developer';
  return 'pro';
}

function normalizeCheckoutPlanSlug(raw) {
  const slug = String(raw || '').toLowerCase();
  if (slug === 'starter') return 'starter';
  if (slug === 'pro' || slug === 'common') return 'pro';
  if (slug === 'unlimited' || slug === 'enterprise' || slug === 'plus' || slug === 'power') return 'unlimited';
  if (slug === 'developer') return 'developer';
  return null;
}

export default function Checkout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { status: sessionStatus, user: sessionUser, refresh: refreshSession } = useSession();
  const planSlug = useMemo(() => {
    const fromQuery = normalizeCheckoutPlanSlug(searchParams.get('plan'));
    if (fromQuery) return fromQuery;
    return planSlugFromPath(location.pathname);
  }, [location.pathname, searchParams]);
  const isDeveloper = planSlug === 'developer';
  const stripeCheckoutPlan = planSlug === 'unlimited' ? 'unlimited' : planSlug;

  const [checkoutInfo, setCheckoutInfo] = useState(null);
  const [planQuote, setPlanQuote] = useState(null);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [error, setError] = useState('');
  const [stripePublishableKey, setStripePublishableKey] = useState('');
  const [stripeClientSecret, setStripeClientSecret] = useState('');
  const [stripeReady, setStripeReady] = useState(false);
  const [ownerTestCheckout, setOwnerTestCheckout] = useState(false);
  const [canUseWayforpayTestCheckout, setCanUseWayforpayTestCheckout] = useState(false);
  const [wayforpayCurrency, setWayforpayCurrency] = useState('USD');
  const [wayforpayModalOpen, setWayforpayModalOpen] = useState(false);
  const wayforpaySuccessNavRef = useRef(null);
  const [activePlanConflict, setActivePlanConflict] = useState(null);
  const stripeAutoLoadRef = useRef(false);
  const paymentProvider = checkoutInfo?.primaryProvider || null;
  const paymentsAvailable = Boolean(checkoutInfo?.checkoutAvailable);
  const useStripeProduction = Boolean(paymentsAvailable && paymentProvider === 'stripe');
  const usePaddlePrimary = Boolean(paymentsAvailable && paymentProvider === 'paddle');
  const paddleCheckoutEnabled = Boolean(checkoutInfo?.paddleCheckoutEnabled);
  const showPaddleAlternate = Boolean(
    paddleCheckoutEnabled
    && !usePaddlePrimary
    && !isDeveloper
    && !activePlanConflict,
  );
  const showTestBanner = Boolean(checkoutInfo?.showTestModeBanner)
    || (ownerTestCheckout && checkoutInfo?.wayforpayTestMode);
  const testBannerText = checkoutInfo?.testModeBannerText || TEST_MODE_BANNER;
  const providerLabel = useStripeProduction
    ? 'Stripe'
    : (checkoutInfo?.providerDisplayName || 'Payment provider');

  const summary = isDeveloper ? DEVELOPER_FALLBACK : planQuote;
  const priceLabel = summary
    ? (Number(summary.amountDisplay) === 0 ? '$0' : `$${summary.amountDisplay}`)
    : '—';
  const payAmountLabel = summary?.amountDisplay
    ? `$${summary.amountDisplay}`
    : priceLabel;

  useEffect(() => {
    fetchCheckoutInfo().then((info) => {
      setCheckoutInfo(info);
      if (info?.wayforpayDefaultCurrency) {
        setWayforpayCurrency(info.wayforpayDefaultCurrency);
      }
    });
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
      const response = await apiClient.post('/api/payments/checkout', {
        plan: stripeCheckoutPlan,
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
  }, [stripeCheckoutPlan, checkoutInfo?.paymentMode]);

  useEffect(() => {
    stripeAutoLoadRef.current = false;
  }, [planSlug]);

  useEffect(() => {
    if (!useStripeProduction || isDeveloper || usePaddlePrimary) return undefined;
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
    usePaddlePrimary,
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

  const openWayforpayModal = () => {
    if (checkoutInfo?.wayforpayTestMode && !canUseWayforpayTestCheckout && !ownerTestCheckout) {
      setError('WayForPay test checkout is not available for this account in this environment.');
      return;
    }
    setError('');
    wayforpaySuccessNavRef.current = null;
    setWayforpayModalOpen(true);
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
    <main className={`checkout-page checkout-page--premium${useStripeProduction ? ' checkout-page--stripe-layout' : ' checkout-page--mock'}`}>
      {!useStripeProduction && (
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
      )}

      {showTestBanner && (
        <p className="checkout-test-mode-banner checkout-test-mode-banner--prominent" role="status">{testBannerText}</p>
      )}

      <section className={`checkout-layout ${useStripeProduction ? 'checkout-layout--cursor' : 'checkout-layout--split'}`}>
        <CheckoutSummaryCard
          isDeveloper={isDeveloper}
          summary={summary}
          priceLabel={priceLabel}
          providerLabel={providerLabel}
          backHref="/pricing"
        />

        <PaymentFormCard light={useStripeProduction}>
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
              {usePaddlePrimary && !activePlanConflict && (
                <>
                  {checkoutInfo?.showPaddleSandboxHint && (
                    <p className="checkout-owner-test-note" role="status">
                      Paddle Sandbox — no real charges. Access is granted only after Paddle webhooks confirm payment.
                    </p>
                  )}
                  <PaddleCheckoutButton
                    planSlug={planSlug}
                    disabled={!sessionReady}
                    paddleSandbox={Boolean(checkoutInfo?.paddleSandbox)}
                    label={`Subscribe with Paddle — $${summary?.amountDisplay || ''} / month`}
                  />
                </>
              )}

              {useStripeProduction && !activePlanConflict ? (
                <ProductionStripeCheckoutForm
                  publishableKey={stripePublishableKey}
                  clientSecret={stripeClientSecret}
                  returnUrl={stripeReturnUrl || checkoutReturnUrl}
                  defaultEmail={sessionUser?.email || ''}
                  emailLocked={Boolean(sessionUser?.email)}
                  disabled={!sessionReady}
                  stripeLoading={checkoutBusy && !stripeReady}
                  stripeLoadError={!checkoutBusy && !stripeReady && error ? error : ''}
                  onStripeError={(message) => setError(message || '')}
                  onRetryStripeLoad={() => {
                    stripeAutoLoadRef.current = false;
                    void startStripeCheckout();
                  }}
                  payLabel={`Subscribe — ${payAmountLabel}/month`}
                  processingLabel="Processing payment…"
                  showStripeTestCardHint={Boolean(checkoutInfo?.showStripeTestCardHint)}
                  showTestModeBanner={false}
                  secureCheckoutLabel={checkoutInfo?.secureCheckoutLabel || 'Secure payment'}
                  appearance="light"
                />
              ) : !usePaddlePrimary ? (
                <>
                  <MockCheckoutForm
                    planName={summary?.name || (planSlug === 'unlimited' ? 'Unlimited' : planSlug === 'starter' ? 'Starter' : 'Pro')}
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

                  {paymentProvider === 'wayforpay' && paymentsAvailable && !useStripeProduction && (
                    <div className="checkout-wayforpay-alt checkout-wayforpay-alt--primary">
                      {wayforpayTestFlow && (
                        <p className="checkout-owner-test-note" role="status">
                          Test mode — use mock card 4242… or complete a simulated payment with no real charge.
                        </p>
                      )}
                      <PaymentButton
                        type="button"
                        disabled={!sessionReady || (checkoutInfo?.wayforpayTestMode && !canUseWayforpayTestCheckout && !ownerTestCheckout)}
                        onClick={openWayforpayModal}
                      >
                        {wayforpayTestFlow ? 'Open test checkout' : 'Continue with WayForPay'}
                      </PaymentButton>
                    </div>
                  )}
                </>
              ) : null}

              {showPaddleAlternate && (
                <PaddleCheckoutButton
                  planSlug={planSlug}
                  disabled={!sessionReady}
                  paddleSandbox={Boolean(checkoutInfo?.paddleSandbox)}
                  label={useStripeProduction ? 'Or pay with Paddle (sandbox)' : 'Pay with Paddle (sandbox)'}
                />
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

      <WayforpayPaymentModal
        open={wayforpayModalOpen}
        onClose={() => {
          setWayforpayModalOpen(false);
          const orderReference = wayforpaySuccessNavRef.current;
          wayforpaySuccessNavRef.current = null;
          if (orderReference) {
            navigate(
              `/checkout/success?plan=${encodeURIComponent(planSlug)}&orderReference=${encodeURIComponent(orderReference)}`,
              { replace: true },
            );
          }
        }}
        planKey={planSlug}
        planTitle={summary?.name ? `${summary.name} — ${priceLabel}` : 'Subscription'}
        priceLabel={priceLabel}
        httpClient={apiClient}
        serverTestMode={Boolean(checkoutInfo?.wayforpayTestMode)}
        developerMode={false}
        userEmail={sessionUser?.email || ''}
        currency={wayforpayCurrency}
        onCurrencyChange={setWayforpayCurrency}
        supportedCurrencies={checkoutInfo?.wayforpaySupportedCurrencies || DEFAULT_WAYFORPAY_CURRENCIES}
        onPaymentSuccess={async (data) => {
          await refreshSession({ force: true });
          if (data?.orderReference) {
            wayforpaySuccessNavRef.current = data.orderReference;
          }
        }}
      />
    </main>
  );
}
