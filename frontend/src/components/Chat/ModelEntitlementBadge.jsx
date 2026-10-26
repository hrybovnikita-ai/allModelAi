import './ModelEntitlementBadge.css';

export default function ModelEntitlementBadge({ tier = 'pro', locked = false }) {
  if (tier === 'free') {
    return <span className="model-entitlement-badge model-entitlement-badge--free">FREE</span>;
  }
  return (
    <span className={`model-entitlement-badge model-entitlement-badge--pro${locked ? ' is-locked' : ''}`}>
      {locked ? '🔒 ' : ''}PRO
    </span>
  );
}
