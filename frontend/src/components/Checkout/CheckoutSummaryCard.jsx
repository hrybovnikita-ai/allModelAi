import { Link } from 'react-router-dom';
import { AllModelAILogoMark } from '../AllModelAILogo/AllModelAILogo';
import { IconCheck, IconLock, IconShield } from './CheckoutIcons';

function planBlurb(summary) {
  if (!summary) return 'Premium AI access with monthly request allowance.';
  const limit = summary.requestLimit?.toLocaleString?.() || summary.requestLimit;
  if (summary.slug === 'starter' || summary.name === 'Starter') {
    return `Core AI models, ${limit} requests per month, and email support.`;
  }
  if (summary.slug === 'unlimited' || summary.name === 'Unlimited') {
    return `All connected providers, ${limit} requests per month, image generation, and dedicated support.`;
  }
  return `Premium AI models, ${limit} requests per month, image generation, and priority routing.`;
}

function formatUsd(summary, priceLabel) {
  if (summary?.amountDisplay != null) return `$${summary.amountDisplay}`;
  if (!priceLabel || priceLabel === '—') return '—';
  if (String(priceLabel).includes('.')) return priceLabel.startsWith('$') ? priceLabel : `$${priceLabel}`;
  const numeric = String(priceLabel).replace(/[^0-9.]/g, '');
  if (!numeric) return priceLabel;
  return `$${Number(numeric).toFixed(2)}`;
}

export default function CheckoutSummaryCard({
  isDeveloper,
  summary,
  priceLabel,
  providerLabel = 'Stripe',
  backHref = '/',
}) {
  const planName = isDeveloper ? 'Developer' : (summary?.name || 'Pro');
  const headline = isDeveloper
    ? 'Activate AllModelAI Developer'
    : `Subscribe to AllModelAI ${planName}`;
  const intervalLabel = summary?.interval === 'year' ? 'year' : 'month';
  const displayAmount = isDeveloper ? '$0.00' : formatUsd(summary, priceLabel);

  return (
    <aside className="checkout-summary-panel checkout-summary-panel--cursor" aria-label="Subscription summary">
      <div className="checkout-summary-brand-row">
        <Link className="checkout-summary-brand" to="/">
          <AllModelAILogoMark size={40} />
          <span>AllModelAI</span>
        </Link>
        <Link className="checkout-summary-back" to={backHref}>← Back</Link>
      </div>

      <p className="checkout-summary-kicker">Subscription</p>
      <h1 className="checkout-summary-headline">{headline}</h1>

      {!isDeveloper && (
        <p className="checkout-summary-hero-price">
          <strong>{displayAmount}</strong>
          <span> / {intervalLabel}</span>
        </p>
      )}

      <article className="checkout-order-card">
        <header className="checkout-order-card__head">
          <div>
            <small>Selected plan</small>
            <strong>AllModelAI {planName}</strong>
          </div>
          <div className="checkout-order-card__price">
            <strong>{displayAmount}</strong>
            <span>/{intervalLabel}</span>
          </div>
        </header>

        <p className="checkout-order-card__blurb">{planBlurb(summary)}</p>

        <ul className="checkout-summary-list checkout-summary-list--premium">
          {(summary?.features || []).map((perk) => (
            <li key={perk}>
              <IconCheck className="checkout-feature-icon" />
              <span>{perk}</span>
            </li>
          ))}
        </ul>

        {!isDeveloper && summary && (
          <dl className="checkout-totals">
            <div>
              <dt>Subtotal</dt>
              <dd>{displayAmount}</dd>
            </div>
            <div>
              <dt>Tax</dt>
              <dd>Calculated by Stripe if applicable</dd>
            </div>
            <div className="checkout-totals__due">
              <dt>Total due today</dt>
              <dd>{displayAmount}</dd>
            </div>
            <div>
              <dt>Currency</dt>
              <dd>USD</dd>
            </div>
            <div>
              <dt>Billing</dt>
              <dd>{intervalLabel === 'year' ? 'Yearly' : 'Monthly'} · renews until canceled</dd>
            </div>
            <div>
              <dt>Processor</dt>
              <dd>{providerLabel}</dd>
            </div>
          </dl>
        )}
      </article>

      <ul className="checkout-trust-list checkout-trust-list--summary">
        <li><IconLock className="checkout-trust-icon" /> Encrypted checkout</li>
        <li><IconShield className="checkout-trust-icon" /> Cancel anytime in billing portal</li>
      </ul>
    </aside>
  );
}
