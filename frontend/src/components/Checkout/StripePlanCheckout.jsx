import { useCallback, useMemo, useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';

const checkoutAppearance = {
  theme: 'night',
  variables: {
    colorPrimary: '#818cf8',
    colorBackground: '#111827',
    colorText: '#f1f5f9',
    colorDanger: '#f87171',
    borderRadius: '10px',
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
  },
  rules: {
    '.Input': { border: '1px solid #334155', boxShadow: 'none' },
    '.Label': { color: '#cbd5e1' },
  },
};

function StripePaymentForm({
  returnUrl,
  onError,
  onSuccess,
  payLabel,
  processingLabel,
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [payBusy, setPayBusy] = useState(false);

  const handleSubmit = useCallback(async (event) => {
    event.preventDefault();
    if (!stripe || !elements) return;
    setPayBusy(true);
    try {
      const result = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: returnUrl },
        redirect: 'if_required',
      });
      if (result.error) {
        onError?.(result.error.message || 'Payment could not be completed.');
        return;
      }
      const intent = result.paymentIntent;
      if (intent?.status === 'succeeded') {
        onSuccess?.(intent.id);
      }
    } finally {
      setPayBusy(false);
    }
  }, [stripe, elements, returnUrl, onError, onSuccess]);

  return (
    <form className="checkout-stripe-form" onSubmit={handleSubmit}>
      <p className="checkout-stripe-field-label">Cardholder / billing details</p>
      <PaymentElement
        options={{
          layout: 'tabs',
          fields: { billingDetails: { name: 'auto', email: 'auto', address: 'auto' } },
        }}
      />
      <button type="submit" className="pay-button checkout-stripe-pay" disabled={payBusy || !stripe}>
        {payBusy ? processingLabel : payLabel}
      </button>
      <p className="checkout-stripe-secure-note" role="note">Secure payment by Stripe</p>
    </form>
  );
}

export default function StripePlanCheckout({
  publishableKey,
  clientSecret,
  returnUrl,
  onError,
  onSuccess,
  payLabel,
  processingLabel = 'Processing test payment…',
}) {
  const stripePromise = useMemo(() => (publishableKey ? loadStripe(publishableKey) : null), [publishableKey]);
  const elementsOptions = useMemo(
    () => ({
      clientSecret,
      appearance: checkoutAppearance,
      loader: 'auto',
    }),
    [clientSecret],
  );

  if (!publishableKey || !clientSecret || !stripePromise || !returnUrl) return null;

  return (
    <div className="checkout-stripe-embedded" aria-label="Stripe secure payment">
      <Elements stripe={stripePromise} options={elementsOptions}>
        <StripePaymentForm
          returnUrl={returnUrl}
          onError={onError}
          onSuccess={onSuccess}
          payLabel={payLabel}
          processingLabel={processingLabel}
        />
      </Elements>
    </div>
  );
}
