import { useCallback } from 'react';
import { IconLock } from './CheckoutIcons';

export default function SubscriptionBillingFields({
  fields,
  onChange,
  disabled = false,
  testModeLabel = '',
  secureLabel = 'Secure payment',
  emailLocked = false,
}) {
  const update = useCallback(
    (key) => (event) => onChange(key, event.target.value),
    [onChange],
  );

  return (
    <>
      <div className="mock-checkout-form-head">
        <div>
          <h2>Payment details</h2>
          {testModeLabel ? (
            <p className="mock-checkout-demo-note checkout-stripe-test-label">{testModeLabel}</p>
          ) : null}
        </div>
        <span className="mock-checkout-secure-badge">
          <IconLock className="mock-checkout-badge-icon" />
          {secureLabel}
        </span>
      </div>

      <fieldset className="mock-checkout-fieldset" disabled={disabled}>
        <legend className="mock-checkout-legend">Billing information</legend>
        <label className="mock-checkout-field mock-checkout-field--first">
          <span>Email</span>
          <input
            type="email"
            name="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={fields.email}
            onChange={emailLocked ? undefined : update('email')}
            readOnly={emailLocked}
            required
          />
        </label>
        <label className="mock-checkout-field">
          <span>Cardholder name</span>
          <input
            type="text"
            name="cardholderName"
            autoComplete="cc-name"
            placeholder="Full name on card"
            value={fields.cardholderName}
            onChange={update('cardholderName')}
            required
          />
        </label>
        <label className="mock-checkout-field">
          <span>Country / region</span>
          <input
            type="text"
            name="country"
            autoComplete="country-name"
            placeholder="United States, Poland, Ukraine…"
            value={fields.country}
            onChange={update('country')}
            required
          />
        </label>
        <label className="mock-checkout-field">
          <span>City</span>
          <input
            type="text"
            name="city"
            autoComplete="address-level2"
            placeholder="San Francisco"
            value={fields.city}
            onChange={update('city')}
            required
          />
        </label>
        <label className="mock-checkout-field">
          <span>Billing address</span>
          <input
            type="text"
            name="streetAddress"
            autoComplete="street-address"
            placeholder="123 Market Street"
            value={fields.streetAddress}
            onChange={update('streetAddress')}
            required
          />
        </label>
        <label className="mock-checkout-field">
          <span>Postal code</span>
          <input
            type="text"
            name="postalCode"
            autoComplete="postal-code"
            placeholder="94103"
            value={fields.postalCode}
            onChange={update('postalCode')}
            required
          />
        </label>
      </fieldset>
    </>
  );
}
