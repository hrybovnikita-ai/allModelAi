import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconLock, IconShield } from './CheckoutIcons';
import CardBrandBadges from './CardBrandBadges';
import PaymentButton from './PaymentButton';
import SubscriptionBillingFields from './SubscriptionBillingFields';
import { BILLING_FIELD_INITIAL } from './billingFieldUtils';
import './MockCheckout.css';

const DEMO_CARD_INITIAL = {
  cardNumber: '',
  expiry: '',
  cvc: '',
};

function formatCardNumber(value) {
  const digits = value.replace(/\D/g, '').slice(0, 19);
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
}

function formatExpiry(value) {
  const digits = value.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

export default function MockCheckoutForm({
  planName = 'Pro',
  planSlug = 'pro',
  priceLabel = '$0',
  interval = 'month',
  disabled = false,
  defaultEmail = '',
  testModeLabel = 'Demo Preview — layout only, no payment processing',
  demoPreview = true,
}) {
  const navigate = useNavigate();
  const formId = useId();
  const [fields, setFields] = useState(() => ({ ...BILLING_FIELD_INITIAL, email: defaultEmail }));
  const [cardFields, setCardFields] = useState(DEMO_CARD_INITIAL);
  const [submitting, setSubmitting] = useState(false);
  const [fieldError, setFieldError] = useState('');
  const [successOpen, setSuccessOpen] = useState(false);

  useEffect(() => {
    if (!defaultEmail) return;
    setFields((current) => (current.email ? current : { ...current, email: defaultEmail }));
  }, [defaultEmail]);

  const onFieldChange = useCallback((key, value) => {
    setFields((current) => ({ ...current, [key]: value }));
    setFieldError('');
  }, []);

  const updateCard = useCallback((key) => (event) => {
    let { value } = event.target;
    if (key === 'cardNumber') value = formatCardNumber(value);
    if (key === 'expiry') value = formatExpiry(value);
    if (key === 'cvc') value = value.replace(/\D/g, '').slice(0, 4);
    setCardFields((current) => ({ ...current, [key]: value }));
    setFieldError('');
  }, []);

  const formComplete = useMemo(() => {
    const billingKeys = ['firstName', 'lastName', 'country', 'city', 'streetAddress', 'postalCode', 'email'];
    if (!billingKeys.every((key) => String(fields[key]).trim())) return false;
    if (!fields.email.includes('@')) return false;
    if (!demoPreview) return true;
    return ['cardNumber', 'expiry', 'cvc'].every((key) => String(cardFields[key]).trim());
  }, [fields, cardFields, demoPreview]);

  const handleSubmit = (event) => {
    event.preventDefault();
    if (disabled || submitting || !formComplete) return;

    if (!fields.email.includes('@')) {
      setFieldError('Enter a valid email address.');
      return;
    }

    setSubmitting(true);
    setFieldError('');
    window.setTimeout(() => {
      setSubmitting(false);
      setSuccessOpen(true);
    }, 1800);
  };

  const closeSuccess = () => {
    setSuccessOpen(false);
    if (demoPreview) return;
    navigate('/dashboard', { replace: true });
  };

  const payLabel = `Subscribe — ${priceLabel} / ${interval}`;

  return (
    <>
      <form id={formId} className="mock-checkout-form" onSubmit={handleSubmit} noValidate>
        <SubscriptionBillingFields
          fields={fields}
          onChange={onFieldChange}
          disabled={disabled || submitting}
          testModeLabel={testModeLabel}
          secureLabel="Demo"
        />

        {demoPreview && (
          <fieldset className="mock-checkout-fieldset" disabled={disabled || submitting}>
            <legend className="mock-checkout-legend">Payment details (demo only)</legend>
            <div className="production-stripe-checkout__brands">
              <p className="production-stripe-checkout__brands-label">Supported cards (visual)</p>
              <CardBrandBadges />
            </div>
            <label className="mock-checkout-field mock-checkout-field--card">
              <span className="mock-checkout-label-row">
                <span>Card number</span>
              </span>
              <input
                type="text"
                name="cardNumber"
                inputMode="numeric"
                autoComplete="off"
                placeholder="4242 4242 4242 4242"
                value={cardFields.cardNumber}
                onChange={updateCard('cardNumber')}
              />
            </label>
            <div className="mock-checkout-row mock-checkout-row--2">
              <label className="mock-checkout-field">
                <span>Expiration date</span>
                <input
                  type="text"
                  name="expiry"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="MM/YY"
                  value={cardFields.expiry}
                  onChange={updateCard('expiry')}
                />
              </label>
              <label className="mock-checkout-field">
                <span>Security code (CVC)</span>
                <input
                  type="text"
                  name="cvc"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="123"
                  value={cardFields.cvc}
                  onChange={updateCard('cvc')}
                />
              </label>
            </div>
          </fieldset>
        )}

        {fieldError && (
          <p className="mock-checkout-error" role="alert">{fieldError}</p>
        )}

        <PaymentButton
          type="submit"
          className="mock-checkout-submit"
          loading={submitting}
          loadingLabel="Processing payment…"
          disabled={disabled || !formComplete}
        >
          {payLabel}
        </PaymentButton>

        <ul className="checkout-trust-list mock-checkout-trust">
          <li><IconShield className="checkout-trust-icon" /> {demoPreview ? 'Demo Preview — no subscription is created' : 'Preview layout only'}</li>
          <li><IconLock className="checkout-trust-icon" /> Live billing uses Stripe secure fields when configured</li>
        </ul>
      </form>

      {successOpen && (
        <div className="mock-checkout-success-overlay" role="presentation" onClick={() => setSuccessOpen(false)}>
          <div
            className="mock-checkout-success-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mock-checkout-success-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mock-checkout-success-icon" aria-hidden="true">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
                <path d="M5 12.5 9.5 17 19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <p className="mock-checkout-success-eyebrow">{demoPreview ? 'Demo Preview only' : 'Payment simulated'}</p>
            <h3 id="mock-checkout-success-title">{demoPreview ? 'Layout preview complete' : 'Subscription successful!'}</h3>
            <p className="mock-checkout-success-body">
              {demoPreview
                ? 'No payment was processed and no premium access was granted. Configure Stripe on the server to use live secure checkout.'
                : `Welcome to AllModelAI ${planName}. Your ${planSlug === 'enterprise' ? 'Enterprise' : planName} plan is ready to explore.`}
            </p>
            <PaymentButton type="button" className="mock-checkout-success-btn" onClick={closeSuccess}>
              {demoPreview ? 'Close preview' : 'Go to dashboard'}
            </PaymentButton>
            <button type="button" className="mock-checkout-success-dismiss" onClick={() => setSuccessOpen(false)}>
              Stay on checkout
            </button>
          </div>
        </div>
      )}
    </>
  );
}
