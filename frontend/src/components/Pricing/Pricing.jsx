import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchCheckoutInfo, TEST_MODE_BANNER } from '../../lib/paymentCheckoutInfo';
import './Pricing.css';

/** Owner review: Developer card shows 5,000 req/mo; Pro shows 3,000 — confirm quotas before changing copy. */
const PLANS = [
  {
    slug: 'developer',
    path: '/checkout?plan=developer',
    tier: 'Developer',
    price: '$0',
    desc: 'Free access for configured developer accounts',
    features: [
      'Access to all connected models',
      '5,000 requests per month',
      'Code Studio and Live Preview',
    ],
    cta: 'Activate Developer',
    featured: false,
  },
  {
    slug: 'pro',
    path: '/checkout/pro',
    tier: 'Pro',
    price: '$19',
    desc: 'Ideal for power users and small teams deploying products',
    features: [
      'Access to premium & standard models',
      '3,000 requests per month',
      'Priority API routing',
      'Email support',
    ],
    cta: 'Upgrade to Pro',
    featured: true,
  },
  {
    slug: 'enterprise',
    path: '/checkout/enterprise',
    tier: 'Enterprise',
    price: '$49',
    desc: 'Designed for high-scale applications and full support',
    features: [
      '12,000 requests across all models',
      'Dedicated support manager',
      'Custom SLA guarantees',
      'Self-hosting options',
    ],
    cta: 'Choose Enterprise',
    featured: false,
  },
];

function PricingCard({ plan, onSelect }) {
  const handleKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect(plan.path);
    }
  };

  return (
    <article
      className={`pricing-card${plan.featured ? ' featured' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={`${plan.tier} plan, ${plan.price} per month. ${plan.cta}`}
      onClick={() => onSelect(plan.path)}
      onKeyDown={handleKeyDown}
    >
      {plan.featured && <span className="featured-badge">Most Popular</span>}
      <span className="pricing-tier">{plan.tier}</span>
      <div className="price">{plan.price}<span>/month</span></div>
      <p className="price-desc">{plan.desc}</p>
      <ul className="pricing-features">
        {plan.features.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <button
        className={`pricing-btn${plan.featured ? ' featured-btn' : ''}`}
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onSelect(plan.path);
        }}
      >
        {plan.cta}
      </button>
    </article>
  );
}

export default function Pricing() {
  const navigate = useNavigate();
  const [banner, setBanner] = useState({ showTestBanner: false, testBannerText: TEST_MODE_BANNER });

  useEffect(() => {
    fetchCheckoutInfo().then((info) => {
      setBanner({
        showTestBanner: Boolean(info?.showTestModeBanner),
        testBannerText: info?.testModeBannerText || TEST_MODE_BANNER,
      });
    });
  }, []);

  return (
    <section id="pricing" className="pricing-section">
      <div className="section-header">
        <h2>Simple, Transparent Pricing</h2>
        <p>Choose the plan that fits your integration needs</p>
        {banner.showTestBanner && (
          <p className="pricing-test-mode-banner" role="status">{banner.testBannerText}</p>
        )}
      </div>
      <div className="pricing-grid">
        {PLANS.map((plan) => (
          <PricingCard key={plan.slug} plan={plan} onSelect={(path) => navigate(path)} />
        ))}
      </div>
    </section>
  );
}
