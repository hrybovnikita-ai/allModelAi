import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AllModelAILogoMark } from '../components/AllModelAILogo/AllModelAILogo';
import {
  UPGRADE_PLANS_STATIC,
  checkoutPathForUpgradeSlug,
} from '../lib/upgradePlansCatalog';
import { resolveApiUrl } from '../lib/apiBase';
import { parseJsonResponse } from '../lib/httpJson';
import './UpgradePage.css';

function mergePlanQuote(staticPlan, quote) {
  if (!quote) return staticPlan;
  return {
    ...staticPlan,
    priceLabel: quote.amountDisplay != null ? `$${quote.amountDisplay}` : staticPlan.priceLabel,
    requestLimit: quote.requestLimit ?? staticPlan.requestLimit,
    features: quote.features?.length ? quote.features : staticPlan.features,
    name: quote.name || staticPlan.name,
  };
}

function UpgradePlanCard({ plan, onSelect }) {
  return (
    <article
      className={`upgrade-plan-card${plan.featured ? ' upgrade-plan-card--featured' : ''}`}
      data-plan={plan.slug}
    >
      {plan.featured ? <span className="upgrade-plan-badge">Most popular</span> : null}
      <header className="upgrade-plan-card__head">
        <h2>{plan.name}</h2>
        <p className="upgrade-plan-card__tagline">{plan.tagline}</p>
      </header>
      <p className="upgrade-plan-card__price">
        <strong>{plan.priceLabel}</strong>
        <span> / {plan.interval}</span>
      </p>
      <p className="upgrade-plan-card__quota">
        {Number(plan.requestLimit).toLocaleString()} requests / month
      </p>
      <ul className="upgrade-plan-card__features">
        {plan.features.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <button
        type="button"
        className="upgrade-plan-card__cta"
        onClick={() => onSelect(plan.slug)}
      >
        {plan.featured ? 'Get Pro+' : `Choose ${plan.name}`}
      </button>
    </article>
  );
}

export default function UpgradePage() {
  const navigate = useNavigate();
  const [quotes, setQuotes] = useState({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        UPGRADE_PLANS_STATIC.map(async (plan) => {
          try {
            const response = await fetch(resolveApiUrl(`/api/payments/plans/${encodeURIComponent(plan.slug)}`), {
              credentials: 'include',
              headers: { Accept: 'application/json' },
            });
            if (!response.ok) return [plan.slug, null];
            const data = await parseJsonResponse(response);
            return [plan.slug, data];
          } catch {
            return [plan.slug, null];
          }
        }),
      );
      if (!cancelled) {
        setQuotes(Object.fromEntries(entries));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const plans = useMemo(
    () => UPGRADE_PLANS_STATIC.map((plan) => mergePlanQuote(plan, quotes[plan.slug])),
    [quotes],
  );

  const goCheckout = (slug) => {
    navigate(checkoutPathForUpgradeSlug(slug));
  };

  return (
    <main className="upgrade-page">
      <div className="upgrade-page__glow upgrade-page__glow--left" aria-hidden="true" />
      <div className="upgrade-page__glow upgrade-page__glow--right" aria-hidden="true" />

      <header className="upgrade-page__header">
        <Link className="upgrade-page__brand" to="/dashboard">
          <AllModelAILogoMark size={36} />
          <span>AllModelAI</span>
        </Link>
        <nav className="upgrade-page__nav" aria-label="Upgrade navigation">
          <Link to="/dashboard">Dashboard</Link>
          <Link to="/billing">Billing</Link>
          <Link to="/chat">Chat</Link>
        </nav>
      </header>

      <section className="upgrade-page__hero">
        <p className="upgrade-page__eyebrow">Upgrade</p>
        <h1>Choose the plan that fits your workflow</h1>
        <p className="upgrade-page__lead">
          Monthly USD billing. Secure checkout with your configured payment provider.
          Subscriptions activate only after verified payment.
        </p>
      </section>

      <div className="upgrade-page__grid">
        {plans.map((plan) => (
          <UpgradePlanCard key={plan.slug} plan={plan} onSelect={goCheckout} />
        ))}
      </div>

      <footer className="upgrade-page__footer">
        <p>
          Legacy Starter, Pro, and Unlimited plans remain available on{' '}
          <Link to="/pricing">Pricing</Link>. Billing history is unchanged in{' '}
          <Link to="/dashboard/orders">Dashboard → Orders</Link>.
        </p>
      </footer>
    </main>
  );
}
