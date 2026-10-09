import { useCallback, useEffect, useId, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconLock, IconShield } from './CheckoutIcons';
import './MockCheckout.css';

const INITIAL = {
  firstName: '',
  lastName: '',
  email: '',
  city: '',
  country: '',
  phone: '',
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
  testModeLabel = 'Demo checkout — no real charge',
}) {
  const navigate = useNavigate();
  const formId = useId();
  const [fields, setFields] = useState(() => ({ ...INITIAL, email: defaultEmail }));
  const [submitting, setSubmitting] = useState(false);
  const [fieldError, setFieldError] = useState('');
  const [successOpen, setSuccessOpen] = useState(false);

  useEffect(() => {
    if (!defaultEmail) return;
    setFields((current) => (current.email ? current : { ...current, email: defaultEmail }));
  }, [defaultEmail]);

  const update = useCallback((key) => (event) => {
    let { value } = event.target;
    if (key === 'cardNumber') value = formatCardNumber(value);
    if (key === 'expiry') value = formatExpiry(value);
    if (key === 'cvc') value = value.replace(/\D/g, '').slice(0, 4);
    setFields((current) => ({ ...current, [key]: value }));
    setFieldError('');
  }, []);

  const handleSubmit = (event) => {
    event.preventDefault();
    if (disabled || submitting) return;

    const required = ['firstName', 'lastName', 'email', 'city', 'country', 'phone', 'cardNumber', 'expiry', 'cvc'];
    const missing = required.find((key) => !String(fields[key]).trim());
    if (missing) {
      setFieldError('Please fill in all fields to continue.');
      return;
    }
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
    navigate('/dashboard', { replace: true });
  };

  return (
    <>
      <form id={formId} className="mock-checkout-form" onSubmit={handleSubmit} noValidate>
        <div className="mock-checkout-form-head">
          <div>
            <h2>Payment details</h2>
            <p className="mock-checkout-demo-note">{testModeLabel}</p>
          </div>
          <span className="mock-checkout-secure-badge">
            <IconLock className="mock-checkout-badge-icon" />
            Simulated
          </span>
        </div>

        <fieldset className="mock-checkout-fieldset" disabled={disabled || submitting}>
          <legend className="mock-checkout-legend">Contact</legend>
          <div className="mock-checkout-row mock-checkout-row--2">
            <label className="mock-checkout-field">
              <span>First name</span>
              <input type="text" name="firstName" autoComplete="given-name" placeholder="Alex" value={fields.firstName} onChange={update('firstName')} />
            </label>
            <label className="mock-checkout-field">
              <span>Surname</span>
              <input type="text" name="lastName" autoComplete="family-name" placeholder="Rivera" value={fields.lastName} onChange={update('lastName')} />
            </label>
          </div>
          <label className="mock-checkout-field">
            <span>Email address</span>
            <input type="email" name="email" autoComplete="email" placeholder="you@example.com" value={fields.email} onChange={update('email')} />
          </label>
          <div className="mock-checkout-row mock-checkout-row--2">
            <label className="mock-checkout-field">
              <span>City</span>
              <input type="text" name="city" autoComplete="address-level2" placeholder="Kyiv" value={fields.city} onChange={update('city')} />
            </label>
            <label className="mock-checkout-field">
              <span>Country</span>
              <input type="text" name="country" autoComplete="country-name" placeholder="Ukraine" value={fields.country} onChange={update('country')} />
            </label>
          </div>
          <label className="mock-checkout-field">
            <span>Phone number</span>
            <input type="tel" name="phone" autoComplete="tel" placeholder="+380 00 000 0000" value={fields.phone} onChange={update('phone')} />
          </label>
        </fieldset>

        <fieldset className="mock-checkout-fieldset" disabled={disabled || submitting}>
          <legend className="mock-checkout-legend">Card</legend>
          <label className="mock-checkout-field">
            <span>Card number</span>
            <div className="mock-checkout-card-wrap">
              <input
                type="text"
                name="cardNumber"
                inputMode="numeric"
                autoComplete="cc-number"
                placeholder="4242 4242 4242 4242"
                value={fields.cardNumber}
                onChange={update('cardNumber')}
              />
              <span className="mock-checkout-card-brand" aria-hidden="true">TEST</span>
            </div>
          </label>
          <div className="mock-checkout-row mock-checkout-row--2">
            <label className="mock-checkout-field">
              <span>Expiry date</span>
              <input type="text" name="expiry" inputMode="numeric" autoComplete="cc-exp" placeholder="MM/YY" value={fields.expiry} onChange={update('expiry')} />
            </label>
            <label className="mock-checkout-field">
              <span>CVC / CVV</span>
              <input type="text" name="cvc" inputMode="numeric" autoComplete="cc-csc" placeholder="123" value={fields.cvc} onChange={update('cvc')} />
            </label>
          </div>
        </fieldset>

        {fieldError && (
          <p className="mock-checkout-error" role="alert">{fieldError}</p>
        )}

        <button type="submit" className="mock-checkout-submit pay-button" disabled={disabled || submitting}>
          {submitting ? (
            <span className="mock-checkout-submit-inner">
              <span className="mock-checkout-spinner" aria-hidden="true" />
              Processing payment…
            </span>
          ) : (
            `Subscribe · ${priceLabel} / ${interval}`
          )}
        </button>

        <ul className="checkout-trust-list mock-checkout-trust">
          <li><IconShield className="checkout-trust-icon" /> Any test card data is accepted</li>
          <li><IconLock className="checkout-trust-icon" /> No real charge in demo mode</li>
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
            <p className="mock-checkout-success-eyebrow">Payment simulated</p>
            <h3 id="mock-checkout-success-title">Subscription successful!</h3>
            <p className="mock-checkout-success-body">
              Welcome to AllModelAI {planName}. Your {planSlug === 'enterprise' ? 'Enterprise' : planName} plan is ready to explore.
            </p>
            <button type="button" className="mock-checkout-success-btn pay-button" onClick={closeSuccess}>
              Go to dashboard
            </button>
            <button type="button" className="mock-checkout-success-dismiss" onClick={() => setSuccessOpen(false)}>
              Stay on checkout
            </button>
          </div>
        </div>
      )}
    </>
  );
}
