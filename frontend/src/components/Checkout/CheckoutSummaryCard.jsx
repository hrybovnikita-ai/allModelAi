import { Link } from 'react-router-dom';
import { AllModelAILogoMark } from '../AllModelAILogo/AllModelAILogo';
import { IconCheck, IconLock, IconShield } from './CheckoutIcons';

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
  backHref = '/pricing',
}) {
  const planName = isDeveloper ? 'Developer' : (summary?.name || 'Pro');
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
      <h1 className="checkout-summary-headline">Complete your subscription</h1>

      {!isDeveloper && (
        <>
          <p className="checkout-summary-plan-name">AllModelAI {planName}</p>
          <p className="checkout-summary-hero-price">
            <strong>{displayAmount}</strong>
            <span> / {intervalLabel}</span>
          </p>
        </>
      )}

      {isDeveloper && (
        <p className="checkout-summary-plan-name">Developer access</p>
      )}

      <article className="checkout-order-card">
        {!isDeveloper && (
          <>
            <h2 className="checkout-benefits-title">Included benefits</h2>
            <ul className="checkout-summary-list checkout-summary-list--premium">
              {(summary?.features || []).map((perk) => (
                <li key={perk}>
                  <IconCheck className="checkout-feature-icon" aria-hidden="true" />
                  <span>{perk}</span>
                </li>
              ))}
            </ul>

            <dl className="checkout-totals">
              <div>
                <dt>Subtotal</dt>
                <dd>{displayAmount}</dd>
              </div>
              <div>
                <dt>Tax</dt>
                <dd>Calculated at checkout if applicable</dd>
              </div>
              <div className="checkout-totals__due">
                <dt>Total due today</dt>
                <dd>{displayAmount}</dd>
              </div>
            </dl>
          </>
        )}
      </article>

      <ul className="checkout-trust-list checkout-trust-list--summary">
        <li><IconLock className="checkout-trust-icon" /> Secure payment</li>
        <li><IconShield className="checkout-trust-icon" /> Cancel anytime</li>
        <li>Subscription renews automatically until you cancel</li>
      </ul>
    </aside>
  );
}
