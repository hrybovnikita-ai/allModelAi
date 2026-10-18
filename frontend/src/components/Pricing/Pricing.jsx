import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AiCreditsPurchaseModal from './AiCreditsPurchaseModal';
import './Pricing.css';

/** Verified subscription catalog — amounts must match backend/src/billing/plans.js */
const PLANS = [
  {
    slug: 'starter',
    path: '/checkout/starter',
    tier: 'Starter',
    price: '$5',
    desc: 'Core AI models for everyday work',
    features: [
      'Core AI models',
      '800 requests per month',
      'Standard response speed',
      'Email support',
    ],
    cta: 'Choose Starter',
    featured: false,
  },
  {
    slug: 'pro',
    path: '/checkout/pro',
    tier: 'Pro',
    price: '$15',
    desc: 'Premium models, image generation, and priority routing',
    features: [
      'Premium model access',
      '3,000 requests per month',
      'Priority routing',
      'Image generation',
      'Priority support',
    ],
    cta: 'Upgrade to Pro',
    featured: true,
  },
  {
    slug: 'unlimited',
    path: '/checkout/unlimited',
    tier: 'Unlimited',
    price: '$30',
    desc: 'All connected providers with the highest routing priority',
    features: [
      'All connected providers',
      '6,000 requests per month',
      'Highest routing priority',
      'Image generation',
      'Dedicated support',
    ],
    cta: 'Choose Unlimited',
    featured: false,
  },
];

const AI_CREDITS_PLAN = {
  slug: 'ai-credits',
  tier: 'AI Credits',
  price: 'From $5',
  priceSuffix: '',
  desc: 'Pay as you go — top up prepaid credits for chat usage',
  features: [
    'Starter, Plus, Pro, and Ultimate packs',
    'Credits never replace subscription quotas',
    'Fulfillment via verified payment webhooks',
    'Creem checkout coming after merchant approval',
  ],
  cta: 'Buy Credits',
  featured: false,
  creditsCard: true,
};

function PricingCard({ plan, onSelect, onCreditsOpen }) {
  const handleKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (plan.creditsCard) onCreditsOpen();
      else onSelect(plan.path);
    }
  };

  const handleActivate = (event) => {
    event.stopPropagation();
    if (plan.creditsCard) onCreditsOpen();
    else onSelect(plan.path);
  };

  const priceSuffix = plan.priceSuffix ?? '/month';

  return (
    <article
      className={`pricing-card${plan.featured ? ' featured' : ''}${plan.creditsCard ? ' credits-card' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={`${plan.tier} plan, ${plan.price}${priceSuffix}. ${plan.cta}`}
      onClick={() => (plan.creditsCard ? onCreditsOpen() : onSelect(plan.path))}
      onKeyDown={handleKeyDown}
    >
      {plan.featured && <span className="featured-badge">Most Popular</span>}
      <span className="pricing-tier">{plan.tier}</span>
      <div className="price">
        {plan.price}
        {priceSuffix ? <span>{priceSuffix}</span> : null}
      </div>
      <p className="price-desc">{plan.desc}</p>
      <ul className="pricing-features">
        {plan.features.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <button
        className={[
          'pricing-btn',
          'pricing-btn-pill',
          plan.featured ? 'featured-btn' : '',
          plan.creditsCard ? 'credits-btn' : '',
          !plan.featured && !plan.creditsCard && plan.slug === 'starter' ? 'starter-btn' : '',
          !plan.featured && !plan.creditsCard && plan.slug === 'unlimited' ? 'unlimited-btn' : '',
        ].filter(Boolean).join(' ')}
        type="button"
        onClick={handleActivate}
      >
        {plan.cta}
      </button>
    </article>
  );
}

export default function Pricing() {
  const navigate = useNavigate();
  const [creditsModalOpen, setCreditsModalOpen] = useState(false);

  return (
    <section id="pricing" className="pricing-section">
      <div className="section-header">
        <h2>Simple, Transparent Pricing</h2>
        <p>Choose the plan that fits your integration needs</p>
      </div>
      <div className="pricing-grid">
        {PLANS.map((plan) => (
          <PricingCard
            key={plan.slug}
            plan={plan}
            onSelect={(path) => navigate(path)}
            onCreditsOpen={() => setCreditsModalOpen(true)}
          />
        ))}
        <PricingCard
          plan={AI_CREDITS_PLAN}
          onSelect={(path) => navigate(path)}
          onCreditsOpen={() => setCreditsModalOpen(true)}
        />
      </div>
      <AiCreditsPurchaseModal open={creditsModalOpen} onClose={() => setCreditsModalOpen(false)} />
    </section>
  );
}
