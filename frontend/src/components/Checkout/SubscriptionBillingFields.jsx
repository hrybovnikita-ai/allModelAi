import { useCallback } from 'react';
import { IconLock } from './CheckoutIcons';

export default function SubscriptionBillingFields({
  fields,
  onChange,
  disabled = false,
  testModeLabel = '',
  secureLabel = 'Secure',
}) {
  const update = useCallback(
    (key) => (event) => onChange(key, event.target.value),
    [onChange],
  );

  return (
    <>
      <div className="mock-checkout-form-head">
        <div>
          <h2>Complete subscription</h2>
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
        <legend className="mock-checkout-legend">Personal information</legend>
        <div className="mock-checkout-row mock-checkout-row--2">
          <label className="mock-checkout-field mock-checkout-field--first">
            <span>First name</span>
            <input
              type="text"
              name="firstName"
              autoComplete="given-name"
              placeholder="Alex"
              value={fields.firstName}
              onChange={update('firstName')}
              required
            />
          </label>
          <label className="mock-checkout-field mock-checkout-field--first">
            <span>Last name</span>
            <input
              type="text"
              name="lastName"
              autoComplete="family-name"
              placeholder="Rivera"
              value={fields.lastName}
              onChange={update('lastName')}
              required
            />
          </label>
        </div>
        <label className="mock-checkout-field">
          <span>Middle name / patronymic (optional)</span>
          <input
            type="text"
            name="middleName"
            autoComplete="additional-name"
            placeholder="Optional"
            value={fields.middleName}
            onChange={update('middleName')}
          />
        </label>
        <label className="mock-checkout-field">
          <span>Email address</span>
          <input
            type="email"
            name="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={fields.email}
            onChange={update('email')}
            required
          />
        </label>
      </fieldset>

      <fieldset className="mock-checkout-fieldset" disabled={disabled}>
        <legend className="mock-checkout-legend">Billing address</legend>
        <label className="mock-checkout-field mock-checkout-field--first">
          <span>Country</span>
          <input
            type="text"
            name="country"
            autoComplete="country-name"
            placeholder="US or United States"
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
          <span>Street address</span>
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
          <span>Apartment / suite (optional)</span>
          <input
            type="text"
            name="apartment"
            autoComplete="address-line2"
            placeholder="Apt 4B"
            value={fields.apartment}
            onChange={update('apartment')}
          />
        </label>
        <div className="mock-checkout-row mock-checkout-row--2">
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
          <label className="mock-checkout-field">
            <span>State / region (if applicable)</span>
            <input
              type="text"
              name="stateRegion"
              autoComplete="address-level1"
              placeholder="CA"
              value={fields.stateRegion}
              onChange={update('stateRegion')}
            />
          </label>
        </div>
      </fieldset>
    </>
  );
}
