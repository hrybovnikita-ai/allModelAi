import { IconCheck, IconLock, IconShield } from './CheckoutIcons';

export default function CheckoutSummaryCard({
  isDeveloper,
  summary,
  priceLabel,
  providerLabel,
}) {
  const planTitle = isDeveloper
    ? 'Developer access'
    : `AllModelAI ${summary?.name || 'Pro'}`;

  return (
    <aside className="checkout-summary-panel glass-panel checkout-summary-panel--premium">
      <div className="checkout-summary-panel__glow" aria-hidden="true" />
      <p className="checkout-eyebrow">Order summary</p>
      <h1>{planTitle}</h1>

      {!isDeveloper && summary && (
        <>
          <div className="checkout-plan checkout-plan--hero checkout-plan--glass checkout-plan--premium">
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

      <h2 className="checkout-summary-features-title">Included in your plan</h2>
      <ul className="checkout-summary-list checkout-summary-list--intro checkout-summary-list--premium">
        {(summary?.features || []).map((perk) => (
          <li key={perk}>
            <IconCheck className="checkout-feature-icon" />
            <span>{perk}</span>
          </li>
        ))}
      </ul>

      {!isDeveloper && (
        <dl className="checkout-meta-list checkout-meta-list--summary">
          <div><dt>Billing cycle</dt><dd>Monthly</dd></div>
          <div><dt>Provider</dt><dd>{providerLabel}</dd></div>
        </dl>
      )}

      <ul className="checkout-trust-list checkout-trust-list--summary checkout-trust-list--premium">
        <li><IconLock className="checkout-trust-icon" /> Encrypted checkout</li>
        <li><IconShield className="checkout-trust-icon" /> Cancel anytime</li>
      </ul>
    </aside>
  );
}
