import { useCallback } from 'react';
import { IconLock } from './CheckoutIcons';

export default function SubscriptionBillingFields({
  fields,
  onChange,
  disabled = false,
  testModeLabel = '',
  secureLabel = 'Secure',
  emailLocked = false,
  variant = 'default',
}) {
  const cursorVariant = variant === 'cursor';
  const update = useCallback(
    (key) => (event) => onChange(key, event.target.value),
    [onChange],
  );

  return (
    <>
      {!cursorVariant ? (
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
      ) : testModeLabel ? (
        <p className="checkout-cursor-test-label" role="status">{testModeLabel}</p>
      ) : null}

      <fieldset className="mock-checkout-fieldset mock-checkout-fieldset--cursor" disabled={disabled}>
        <legend className="mock-checkout-legend mock-checkout-legend--section">Contact information</legend>
        <label className="mock-checkout-field mock-checkout-field--cursor">
          {!cursorVariant ? <span>Email address</span> : null}
          <input
            type="email"
            name="email"
            autoComplete="email"
            placeholder="Email address"
            value={fields.email}
            onChange={emailLocked ? undefined : update('email')}
            readOnly={emailLocked}
            required
          />
          {emailLocked && !cursorVariant ? (
            <p className="checkout-contact-locked-note">
              Billed to your AllModelAI account email. Contact support to change the account owner.
            </p>
          ) : null}
        </label>
        {cursorVariant ? (
          <div className="mock-checkout-row mock-checkout-row--2 checkout-cursor-name-row">
            <label className="mock-checkout-field">
              <span className="sr-only">First name</span>
              <input
                type="text"
                name="firstName"
                autoComplete="given-name"
                placeholder="First name"
                value={fields.firstName}
                onChange={update('firstName')}
                required
              />
            </label>
            <label className="mock-checkout-field">
              <span className="sr-only">Last name</span>
              <input
                type="text"
                name="lastName"
                autoComplete="family-name"
                placeholder="Last name"
                value={fields.lastName}
                onChange={update('lastName')}
                required
              />
            </label>
          </div>
        ) : (
          <>
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
              <span>Cardholder name</span>
              <input
                type="text"
                name="middleName"
                autoComplete="cc-name"
                placeholder="Name as it appears on the card"
                value={fields.middleName}
                onChange={update('middleName')}
              />
            </label>
          </>
        )}
      </fieldset>

      <fieldset className="mock-checkout-fieldset mock-checkout-fieldset--cursor" disabled={disabled}>
        <legend className="mock-checkout-legend mock-checkout-legend--section">Billing address</legend>
        <label className="mock-checkout-field mock-checkout-field--first">
          <span className={cursorVariant ? 'sr-only' : undefined}>Country / region</span>
          <input
            type="text"
            name="country"
            autoComplete="country-name"
            placeholder={cursorVariant ? 'Country / region' : 'United States, Poland, Ukraine…'}
            value={fields.country}
            onChange={update('country')}
            required
          />
        </label>
        <label className="mock-checkout-field">
          <span className={cursorVariant ? 'sr-only' : undefined}>Street address</span>
          <input
            type="text"
            name="streetAddress"
            autoComplete="street-address"
            placeholder="Street address"
            value={fields.streetAddress}
            onChange={update('streetAddress')}
            required
          />
        </label>
        {!cursorVariant ? (
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
        ) : null}
        <label className="mock-checkout-field">
          <span className={cursorVariant ? 'sr-only' : undefined}>City</span>
          <input
            type="text"
            name="city"
            autoComplete="address-level2"
            placeholder="City"
            value={fields.city}
            onChange={update('city')}
            required
          />
        </label>
        <div className="mock-checkout-row mock-checkout-row--2">
          <label className="mock-checkout-field">
            <span className={cursorVariant ? 'sr-only' : undefined}>State / region</span>
            <input
              type="text"
              name="stateRegion"
              autoComplete="address-level1"
              placeholder="State / region"
              value={fields.stateRegion}
              onChange={update('stateRegion')}
            />
          </label>
          <label className="mock-checkout-field">
            <span className={cursorVariant ? 'sr-only' : undefined}>Postal code</span>
            <input
              type="text"
              name="postalCode"
              autoComplete="postal-code"
              placeholder="Postal code"
              value={fields.postalCode}
              onChange={update('postalCode')}
              required
            />
          </label>
        </div>
      </fieldset>

      {cursorVariant ? (
        <p className="checkout-cursor-secure-hint">
          <IconLock className="mock-checkout-badge-icon" aria-hidden="true" />
          {secureLabel} · Subscription activates after Stripe webhook confirmation
        </p>
      ) : null}
    </>
  );
}
