import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import apiClient from '../../lib/apiClient';
import './Checkout.css';
import './CheckoutDemo.css';
import './CheckoutProduction.css';
import { AllModelAILogoMark } from '../AllModelAILogo/AllModelAILogo';
import { buildClientTestCheckoutInfo, fetchCheckoutInfo, TEST_MODE_BANNER } from '../../lib/paymentCheckoutInfo';
import { apiFetch } from '../../lib/api';
import { pollWayforpayPaymentStatus, runTestWayforpayCheckout, submitWayforpayCheckout } from '../../lib/wayforpay';

const plans = {
  developer: { key: 'developer', name: 'Developer', price: 0, interval: 'month', limit: '5,000', badge: 'FREE FOR DEVELOPERS', models: 'All models', perks: ['All AI providers', '5,000 requests each month', 'Code Studio and Live Preview'] },
  week: { key: 'week', name: 'Weekly', price: 5.99, interval: 'week', limit: '500', badge: 'FLEXIBLE', models: '6 core models', perks: ['Gemini, GPT, Llama and DeepSeek', '500 requests each week', 'Cancel anytime'] },
  common: { key: 'common', name: 'Pro Monthly', price: 19, interval: 'month', limit: '3,000', badge: 'MOST POPULAR', models: 'All hosted models', perks: ['Perplexity, Kimi, Claude and more', '3,000 requests each month', 'Priority model routing'] },
  plus: { key: 'plus', name: 'Power Monthly', price: 49, interval: 'month', limit: '12,000', badge: 'POWER', models: 'All models', perks: ['Every connected provider', '12,000 requests each month', 'Arena, workflows and analytics'] },
};

const aliases = { starter: 'developer', free: 'developer', pro: 'common', monthly: 'common', enterprise: 'plus', power: 'plus' };
const skills = [
  ['01', 'Multi-model chat', 'Use every model included with your active plan.', '/chat'],
  ['02', 'Prompt Versioning', 'Save, rate, share, and compare reusable prompts.', '/prompts'],
  ['03', 'AI Workflows', 'Chain research, writing, coding, and review steps.', '/studio?tool=chains'],
  ['04', 'Usage Analytics', 'Track requests, limits, and model activity.', '/studio?tool=analytics'],
  ['05', 'Website Builder', 'Generate source files and preview websites live.', '/website-builder'],
  ['06', 'Answer Verifier', 'Check answers for quality and unsupported claims.', '/ai-tools?tool=quality'],
];

export default function Checkout() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initial = aliases[searchParams.get('plan')] || searchParams.get('plan') || 'common';
  const [selectedPlan, setSelectedPlan] = useState(plans[initial] ? initial : 'common');
  const [checkoutInfo, setCheckoutInfo] = useState(() => buildClientTestCheckoutInfo());
  const [checkoutBusy, setCheckoutBusy] = useState(() => {
    const sessionId = searchParams.get('session_id');
    const wayforpayReturn = searchParams.get('wayforpay') === 'return' && searchParams.get('orderReference');
    return (searchParams.get('success') === '1' && Boolean(sessionId)) || Boolean(wayforpayReturn);
  });
  const [error, setError] = useState('');
  const [testSuccess, setTestSuccess] = useState(null);
  const [purchase, setPurchase] = useState(() => {
    return searchParams.get('success') === 'developer' ? { plan: 'developer' } : null;
  });
  const summary = useMemo(() => plans[selectedPlan], [selectedPlan]);
  const providerLabel = checkoutInfo?.checkoutSecureLabel || 'CHECKOUT';
  const testBannerText = checkoutInfo?.testModeBannerText || TEST_MODE_BANNER;
  const showTestBanner = Boolean(checkoutInfo?.showTestModeBanner);
  const isMockWayforpay = Boolean(checkoutInfo?.wayforpayMockCheckout);

  useEffect(() => {
    fetchCheckoutInfo().then(setCheckoutInfo);
  }, []);

  useEffect(() => {
    if (!testSuccess) return undefined;
    const timer = window.setTimeout(() => {
      navigate('/dashboard', {
        replace: true,
        state: { subscriptionActivated: testSuccess },
      });
    }, 2200);
    return () => window.clearTimeout(timer);
  }, [testSuccess, navigate]);

  useEffect(() => {
    const sessionId = searchParams.get('session_id');
    if (searchParams.get('success') === 'developer') return;
    if (!sessionId || searchParams.get('success') !== '1') return;
    apiClient.get(`/api/payments/session/${encodeURIComponent(sessionId)}`)
      .then((response) => setPurchase(response.data.purchase))
      .catch((requestError) => setError(requestError.response?.data?.message || 'Stripe payment could not be verified.'))
      .finally(() => setCheckoutBusy(false));
  }, [searchParams]);

  useEffect(() => {
    const orderReference = searchParams.get('orderReference');
    if (searchParams.get('wayforpay') !== 'return' || !orderReference) return undefined;

    let cancelled = false;
    (async () => {
      try {
        const paid = await pollWayforpayPaymentStatus(apiFetch, orderReference);
        if (cancelled) return;
        if (!paid?.paid) {
          throw new Error('Payment confirmation is still pending.');
        }
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

  const runLiveWayforpayCheckout = async (planKey) => {
    const response = await apiClient.post('/api/payments/wayforpay/create', { plan: planKey });
    if (response.data.mockCheckout || response.data.testMode) {
      throw new Error('Unexpected test checkout response. Refresh the page and try again.');
    }
    if (isMockWayforpay) {
      throw new Error('Test mode: real WayForPay redirect is blocked.');
    }
    submitWayforpayCheckout(response.data);
  };

  const beginCheckout = async () => {
    setCheckoutBusy(true);
    setError('');
    setTestSuccess(null);
    let testPaymentSucceeded = false;
    try {
      const info = checkoutInfo || await fetchCheckoutInfo();
      const provider = info?.primaryProvider;
      const mockMode = Boolean(info?.wayforpayMockCheckout ?? isMockWayforpay);

      if (summary.price > 0 && mockMode) {
        const result = await runTestWayforpayCheckout(apiClient, selectedPlan);
        if (!result?.paid && !result?.success) {
          throw new Error('Test payment was not confirmed by the server.');
        }
        setTestSuccess(result);
        testPaymentSucceeded = true;
        return;
      }

      if (summary.price > 0 && (provider === 'wayforpay' || mockMode)) {
        await runLiveWayforpayCheckout(selectedPlan);
        return;
      }

      if (summary.price > 0 && mockMode) {
        throw new Error('Test mode: paid checkout uses WayForPay mock only.');
      }

      const response = await apiClient.post('/api/payments/checkout', { plan: selectedPlan });

      if (response.data.developerAccess) {
        setPurchase(response.data.purchase);
        return;
      }

      if (response.data.useWayforpay) {
        await runLiveWayforpayCheckout(selectedPlan);
        return;
      }

      if (mockMode) {
        throw new Error('Test mode: external payment redirect is blocked.');
      }
      if (!response.data.checkoutUrl) throw new Error('Payment provider did not return a checkout page.');
      window.location.assign(response.data.checkoutUrl);
    } catch (requestError) {
      const message = requestError.response?.data?.message
        || requestError.message
        || 'Could not start secure checkout.';
      setError(message);
      if (requestError.response?.status === 401) {
        setError(`${message} Open Login and sign in, then return to checkout.`);
      }
    } finally {
      if (!testPaymentSucceeded) setCheckoutBusy(false);
    }
  };

  const payButtonLabel = () => {
    if (checkoutBusy && isMockWayforpay) return 'Processing test payment....';
    if (checkoutBusy) return 'Processing…';
    if (!summary.price) return 'Activate developer access';
    if (isMockWayforpay) return `Complete test payment · $${summary.price}/${summary.interval}`;
    return `Continue to payment · $${summary.price}/${summary.interval}`;
  };

  if (testSuccess) {
    return (
      <main className="checkout-page purchase-success-page">
        <nav className="checkout-nav"><Link className="checkout-brand" to="/"><AllModelAILogoMark />AllModelAI</Link><Link to="/dashboard">Dashboard</Link></nav>
        <p className="checkout-eyebrow">Test payment</p>
        <div className="success-mark" aria-hidden="true">&#10003;</div>
        <h1>{testSuccess.message || `Test payment successful — ${summary.name} activated.`}</h1>
        <p className="checkout-success">
          {testSuccess.requestLimit
            ? `${testSuccess.requestLimit.toLocaleString()} requests/${testSuccess.billingInterval || summary.interval} are now active on this account.`
            : 'Your plan limits are now active on this account.'}
        </p>
        <p className="checkout-disclaimer">Redirecting to Dashboard…</p>
      </main>
    );
  }

  if (purchase) return <main className="checkout-page purchase-success-page">
    <nav className="checkout-nav"><Link className="checkout-brand" to="/"><AllModelAILogoMark />AllModelAI</Link><Link to="/dashboard">Dashboard</Link></nav>
    <p className="checkout-eyebrow">Access activated</p><div className="success-mark" aria-hidden="true">&#10003;</div>
    <h1>Your AllModelAI plan is ready.</h1><p>Your request limit and model access are now active on this account.</p>
    <div className="skill-grid">{skills.map(([index,title,description,to])=><Link className="skill-card" key={index} to={to}><span>{index}</span><strong>{title}</strong><small>{description}</small><b>Open skill &rarr;</b></Link>)}</div>
  </main>;

  return <main className="checkout-page">
    <nav className="checkout-nav"><Link className="checkout-brand" to="/"><AllModelAILogoMark />AllModelAI</Link><Link to="/dashboard">Dashboard</Link><Link to="/login">Login</Link></nav>
    {showTestBanner && (
      <p className="checkout-test-mode-banner checkout-test-mode-banner--prominent" role="status">{testBannerText}</p>
    )}
    <section className="checkout-layout">
      <div className="checkout-intro">
        <p className="checkout-eyebrow">Plans and model limits</p><h1>Choose how much AI you need.</h1>
        <p>Select a weekly or monthly request limit. Payments are processed on a secure hosted page; AllModelAI never receives your card number or CVC.</p>
        <div className="checkout-plan-grid checkout-plan-grid-four">{Object.values(plans).map((plan)=><button type="button" className={selectedPlan===plan.key?'selected':''} onClick={()=>setSelectedPlan(plan.key)} key={plan.key}><i>{plan.badge}</i><span>{plan.name}</span><strong>${plan.price}<small>/{plan.interval}</small></strong><small>{plan.limit} requests · {plan.models}</small><ul>{plan.perks.map((perk)=><li key={perk}>{perk}</li>)}</ul></button>)}</div>
      </div>
      <section className="checkout-form stripe-checkout-card">
        {showTestBanner && (
          <p className="checkout-test-mode-inline" role="status">{testBannerText}</p>
        )}
        <div className="secure-row"><span>{providerLabel}</span><small>{isMockWayforpay ? 'Simulated callback' : 'Encrypted payment'}</small></div>
        <h2>{summary.name}</h2><div className="checkout-plan"><span>{summary.limit} requests / {summary.interval}</span><strong>${summary.price}<small>/{summary.interval}</small></strong></div>
        <div className="checkout-model-access"><span>Model access</span><strong>{summary.models}</strong></div>
        <ul className="checkout-summary-list">{summary.perks.map((perk)=><li key={perk}>{perk}</li>)}</ul>
        {selectedPlan === 'developer' && <p className="developer-access-note">Developer access is free only for emails listed in <code>DEVELOPER_EMAILS</code>.</p>}
        {searchParams.get('canceled') && <p className="checkout-error">Checkout was canceled. Nothing was charged.</p>}
        {error && <p className="checkout-error" role="alert">{error}</p>}
        <button className="pay-button" type="button" disabled={checkoutBusy} onClick={beginCheckout}>
          {payButtonLabel()}
        </button>
        <small className="checkout-disclaimer">
          {isMockWayforpay
            ? 'Test mode: no WayForPay redirect. Your plan updates only after the server simulates a signed callback.'
            : 'Your plan activates only after WayForPay sends a confirmed callback to our server.'}
        </small>
      </section>
    </section>
  </main>;
}
