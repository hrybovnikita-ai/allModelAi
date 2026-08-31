import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import './Checkout.css';
import './CheckoutDemo.css';
import './CheckoutProduction.css';

const plans = {
  developer: { key: 'developer', name: 'Developer', price: 0, interval: 'month', limit: '5,000', badge: 'FREE FOR DEVELOPERS', models: 'All models', perks: ['All AI providers', '5,000 requests each month', 'Code Studio and Live Preview'] },
  week: { key: 'week', name: 'Weekly', price: 5.99, interval: 'week', limit: '500', badge: 'FLEXIBLE', models: '6 core models', perks: ['Gemini, GPT, Llama and DeepSeek', '500 requests each week', 'Cancel from Stripe anytime'] },
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
  const [searchParams] = useSearchParams();
  const initial = aliases[searchParams.get('plan')] || searchParams.get('plan') || 'common';
  const [selectedPlan, setSelectedPlan] = useState(plans[initial] ? initial : 'common');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [purchase, setPurchase] = useState(null);
  const summary = useMemo(() => plans[selectedPlan], [selectedPlan]);

  useEffect(() => {
    const sessionId = searchParams.get('session_id');
    if (searchParams.get('success') === 'developer') { setPurchase({ plan: 'developer' }); return; }
    if (!sessionId || searchParams.get('success') !== '1') return;
    setSubmitting(true);
    axios.get(`/api/payments/session/${encodeURIComponent(sessionId)}`, { withCredentials: true })
      .then((response) => setPurchase(response.data.purchase))
      .catch((requestError) => setError(requestError.response?.data?.message || 'Stripe payment could not be verified.'))
      .finally(() => setSubmitting(false));
  }, [searchParams]);

  const beginCheckout = async () => {
    try {
      setSubmitting(true); setError('');
      const response = await axios.post('/api/payments/checkout', { plan: selectedPlan }, { withCredentials: true });
      if (response.data.developerAccess) { setPurchase(response.data.purchase); return; }
      if (!response.data.checkoutUrl) throw new Error('Stripe did not return a checkout page.');
      window.location.assign(response.data.checkoutUrl);
    } catch (requestError) {
      setError(requestError.response?.data?.message || requestError.message || 'Could not start secure checkout.');
    } finally { setSubmitting(false); }
  };

  if (purchase) return <main className="checkout-page purchase-success-page">
    <nav className="checkout-nav"><Link className="checkout-brand" to="/"><span>AI</span>AllModelAI</Link><Link to="/dashboard">Dashboard</Link></nav>
    <p className="checkout-eyebrow">Access activated</p><div className="success-mark" aria-hidden="true">&#10003;</div>
    <h1>Your AllModelAI plan is ready.</h1><p>Your request limit and model access are now active on this account.</p>
    <div className="skill-grid">{skills.map(([index,title,description,to])=><Link className="skill-card" key={index} to={to}><span>{index}</span><strong>{title}</strong><small>{description}</small><b>Open skill &rarr;</b></Link>)}</div>
  </main>;

  return <main className="checkout-page">
    <nav className="checkout-nav"><Link className="checkout-brand" to="/"><span>AI</span>AllModelAI</Link><Link to="/dashboard">Dashboard</Link></nav>
    <section className="checkout-layout">
      <div className="checkout-intro">
        <p className="checkout-eyebrow">Plans and model limits</p><h1>Choose how much AI you need.</h1>
        <p>Select a weekly or monthly request limit. Paid checkout is securely hosted by Stripe; AllModelAI never receives your card number or CVC.</p>
        <div className="checkout-plan-grid checkout-plan-grid-four">{Object.values(plans).map((plan)=><button type="button" className={selectedPlan===plan.key?'selected':''} onClick={()=>setSelectedPlan(plan.key)} key={plan.key}><i>{plan.badge}</i><span>{plan.name}</span><strong>${plan.price}<small>/{plan.interval}</small></strong><small>{plan.limit} requests · {plan.models}</small><ul>{plan.perks.map((perk)=><li key={perk}>{perk}</li>)}</ul></button>)}</div>
      </div>
      <section className="checkout-form stripe-checkout-card">
        <div className="secure-row"><span>STRIPE SECURE CHECKOUT</span><small>Encrypted payment</small></div>
        <h2>{summary.name}</h2><div className="checkout-plan"><span>{summary.limit} requests / {summary.interval}</span><strong>${summary.price}<small>/{summary.interval}</small></strong></div>
        <div className="checkout-model-access"><span>Model access</span><strong>{summary.models}</strong></div>
        <ul className="checkout-summary-list">{summary.perks.map((perk)=><li key={perk}>{perk}</li>)}</ul>
        {selectedPlan === 'developer' && <p className="developer-access-note">Developer access is free only for emails listed in <code>DEVELOPER_EMAILS</code>.</p>}
        {searchParams.get('canceled') && <p className="checkout-error">Checkout was canceled. Nothing was charged.</p>}
        {error && <p className="checkout-error" role="alert">{error}</p>}
        <button className="pay-button" type="button" disabled={submitting} onClick={beginCheckout}>{submitting ? 'Preparing secure checkout...' : summary.price ? `Continue to Stripe · $${summary.price}/${summary.interval}` : 'Activate developer access'}</button>
        <small className="checkout-disclaimer">Paid subscriptions renew automatically until canceled. Stripe collects billing details on the next screen.</small>
      </section>
    </section>
  </main>;
}
