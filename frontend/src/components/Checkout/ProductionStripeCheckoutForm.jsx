import { useCallback, useEffect, useRef, useState } from 'react';
import CardBrandBadges from './CardBrandBadges';
import PaymentButton from './PaymentButton';
import StripeEmbeddedCheckout from './StripeEmbeddedCheckout';
import SubscriptionBillingFields from './SubscriptionBillingFields';
import {
  BILLING_FIELD_INITIAL,
  buildStripeBillingAddress,
  validateBillingFields,
} from './billingFieldUtils';
import { STRIPE_TEST_MODE_BANNER } from '../../lib/paymentCheckoutInfo';
import './MockCheckout.css';

export default function ProductionStripeCheckoutForm({
  publishableKey,
  clientSecret,
  returnUrl,
  defaultEmail = '',
  disabled = false,
  stripeLoading = false,
  stripeLoadError = '',
  onStripeError,
  onRetryStripeLoad,
  payLabel,
  processingLabel = 'Processing payment…',
  showStripeTestCardHint = false,
  showTestModeBanner = false,
  secureCheckoutLabel = 'Secure payment',
  emailLocked = false,
  appearance = 'light',
}) {
  const confirmRef = useRef(null);
  const [fields, setFields] = useState(() => ({ ...BILLING_FIELD_INITIAL, email: defaultEmail }));
  const [fieldError, setFieldError] = useState('');
  const [payBusy, setPayBusy] = useState(false);

  useEffect(() => {
    if (!defaultEmail) return;
    setFields((current) => (current.email ? current : { ...current, email: defaultEmail }));
  }, [defaultEmail]);

  const onFieldChange = useCallback((key, value) => {
    setFields((current) => ({ ...current, [key]: value }));
    setFieldError('');
  }, []);

  const getBillingDetails = useCallback(
    () => ({
      email: String(fields.email || '').trim(),
      billingAddress: buildStripeBillingAddress(fields),
    }),
    [fields],
  );

  const testModeLabel = showTestModeBanner ? STRIPE_TEST_MODE_BANNER : '';

  const handleSubscribe = useCallback(async () => {
    if (disabled || payBusy || stripeLoading) return;
    const validationMessage = validateBillingFields(fields);
    if (validationMessage) {
      setFieldError(validationMessage);
      return;
    }
    if (!clientSecret || !publishableKey) {
      setFieldError(stripeLoadError || 'Secure payment form is still loading. Please wait.');
      return;
    }
    setPayBusy(true);
    setFieldError('');
    try {
      const confirm = confirmRef.current;
      if (!confirm) {
        setFieldError('Payment form is not ready yet. Wait a moment and try again.');
        return;
      }
      await confirm();
    } finally {
      setPayBusy(false);
    }
  }, [
    disabled,
    payBusy,
    stripeLoading,
    fields,
    clientSecret,
    publishableKey,
    stripeLoadError,
  ]);

  const stripeReady = Boolean(clientSecret && publishableKey);

  return (
    <div className="mock-checkout-form production-stripe-checkout">
      <SubscriptionBillingFields
        fields={fields}
        onChange={onFieldChange}
        disabled={disabled || payBusy}
        testModeLabel={testModeLabel}
        secureLabel={secureCheckoutLabel}
        emailLocked={emailLocked || Boolean(defaultEmail)}
      />

      <fieldset className="mock-checkout-fieldset mock-checkout-fieldset--payment" disabled={disabled || payBusy}>
        <legend className="mock-checkout-legend">Payment method</legend>
        <div className="production-stripe-checkout__brands">
          <p className="production-stripe-checkout__brands-label">Supported cards</p>
          <CardBrandBadges className="production-stripe-checkout__badges" />
        </div>
        <p className="production-stripe-checkout__pe-hint">
          Card number, expiration date, and security code are collected in Stripe&apos;s secure fields.
          Your card brand is detected automatically as you type.
        </p>

        {stripeLoading && (
          <p className="checkout-stripe-loading" role="status">Preparing secure payment form…</p>
        )}

        {stripeLoadError && !stripeLoading && (
          <div className="stripe-embedded-error" role="alert">
            <p>{stripeLoadError}</p>
            {onRetryStripeLoad ? (
              <PaymentButton type="button" variant="secondary" onClick={onRetryStripeLoad}>
                Retry loading payment form
              </PaymentButton>
            ) : null}
          </div>
        )}

        {stripeReady && (
          <StripeEmbeddedCheckout
            className="production-stripe-checkout__element"
            publishableKey={publishableKey}
            clientSecret={clientSecret}
            returnUrl={returnUrl}
            payLabel={payLabel}
            processingLabel={processingLabel}
            getBillingDetails={getBillingDetails}
            confirmRef={confirmRef}
            hidePayButton
            appearance={appearance}
            onError={(message) => {
              if (message) setFieldError(message);
              onStripeError?.(message);
            }}
          />
        )}

        {showStripeTestCardHint && (
          <div className="checkout-dev-test-card" role="note">
            <strong>Stripe test cards</strong>
            <span>4242 4242 4242 4242 · any future expiry · any CVC</span>
            <span>Use fictional billing details where Stripe allows.</span>
          </div>
        )}
      </fieldset>

      {fieldError && (
        <p className="mock-checkout-error" role="alert">{fieldError}</p>
      )}

      <PaymentButton
        type="button"
        className="mock-checkout-submit"
        loading={payBusy || stripeLoading}
        loadingLabel={processingLabel}
        disabled={disabled || !stripeReady}
        onClick={() => { void handleSubscribe(); }}
      >
        {payLabel}
      </PaymentButton>

      <p className="checkout-stripe-secure-note">
        Premium access is granted only after Stripe confirms your subscription on our servers.
      </p>
    </div>
  );
}
