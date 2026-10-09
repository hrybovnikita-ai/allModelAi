import { useCallback, useMemo, useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import {
  CheckoutElementsProvider,
  ExpressCheckoutElement,
  PaymentElement,
  useCheckoutElements,
} from '@stripe/react-stripe-js/checkout';
import './StripeEmbeddedCheckout.css';

export const stripeCheckoutAppearance = {
  theme: 'night',
  variables: {
    colorPrimary: '#818cf8',
    colorBackground: '#0f1424',
    colorText: '#f1f5f9',
    colorTextSecondary: '#94a3b8',
    colorDanger: '#f87171',
    borderRadius: '12px',
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
    spacingUnit: '4px',
  },
  rules: {
    '.Input': {
      border: '1px solid rgba(129, 140, 248, 0.35)',
      boxShadow: 'none',
      backgroundColor: '#111827',
    },
    '.Label': { color: '#cbd5e1', fontWeight: '600' },
    '.Tab': { borderColor: 'rgba(129, 140, 248, 0.25)' },
    '.Tab--selected': { borderColor: '#818cf8' },
  },
};

function StripeCheckoutInner({
  returnUrl,
  onError,
  payLabel,
  processingLabel,
  compact = false,
}) {
  const checkoutState = useCheckoutElements();
  const [payBusy, setPayBusy] = useState(false);
  const [walletsVisible, setWalletsVisible] = useState(false);

  const handleExpressConfirm = useCallback(async (event) => {
    if (checkoutState.type !== 'success') return;
    setPayBusy(true);
    try {
      const result = await checkoutState.checkout.confirm({
        expressCheckoutConfirmEvent: event,
        returnUrl,
      });
      if (result.type === 'error') onError?.(result.error.message);
    } finally {
      setPayBusy(false);
    }
  }, [checkoutState, returnUrl, onError]);

  const handleCardPay = useCallback(async () => {
    if (checkoutState.type !== 'success') return;
    setPayBusy(true);
    try {
      const result = await checkoutState.checkout.confirm({ returnUrl });
      if (result.type === 'error') onError?.(result.error.message);
    } finally {
      setPayBusy(false);
    }
  }, [checkoutState, returnUrl, onError]);

  if (checkoutState.type === 'loading') {
    return (
      <div className="stripe-embedded-loading" role="status">
        <span className="stripe-embedded-spinner" aria-hidden="true" />
        <p>Loading secure payment form…</p>
      </div>
    );
  }

  if (checkoutState.type === 'error') {
    const message = checkoutState.error?.message || 'Payment form could not load.';
    onError?.(message);
    return (
      <div className="stripe-embedded-error" role="alert">
        <p>{message}</p>
      </div>
    );
  }

  return (
    <div className={`stripe-embedded-inner${compact ? ' stripe-embedded-inner--compact' : ''}`}>
      <ExpressCheckoutElement
        options={{
          paymentMethods: {
            applePay: 'auto',
            googlePay: 'auto',
            link: 'auto',
          },
          paymentMethodOrder: ['apple_pay', 'google_pay', 'link'],
          layout: { maxColumns: 2, maxRows: 1 },
        }}
        onReady={({ availablePaymentMethods }) => {
          setWalletsVisible(Boolean(availablePaymentMethods && Object.keys(availablePaymentMethods).length));
        }}
        onConfirm={handleExpressConfirm}
      />
      {walletsVisible && (
        <p className="stripe-embedded-wallets-hint">Apple Pay · Google Pay · Link</p>
      )}
      <div className="stripe-embedded-divider"><span>Card</span></div>
      <PaymentElement options={{ layout: 'tabs' }} />
      <button
        type="button"
        className="pay-button stripe-embedded-pay"
        disabled={payBusy}
        onClick={handleCardPay}
      >
        {payBusy ? processingLabel : payLabel}
      </button>
      <p className="stripe-embedded-secure" role="note">
        <span aria-hidden="true">🔒</span> Secure checkout powered by Stripe
      </p>
    </div>
  );
}

export default function StripeEmbeddedCheckout({
  publishableKey,
  clientSecret,
  returnUrl,
  onError,
  payLabel = 'Subscribe',
  processingLabel = 'Processing…',
  compact = false,
  className = '',
}) {
  const stripePromise = useMemo(() => {
    if (!publishableKey) return null;
    return loadStripe(publishableKey);
  }, [publishableKey]);

  const providerOptions = useMemo(
    () => ({
      clientSecret,
      elementsOptions: { appearance: stripeCheckoutAppearance, loader: 'auto' },
    }),
    [clientSecret],
  );

  if (!publishableKey || !clientSecret || !stripePromise || !returnUrl) {
    return (
      <div className="stripe-embedded-error" role="alert">
        <p>Payment form is not ready. Check Stripe keys on the server and try again.</p>
      </div>
    );
  }

  return (
    <div className={`stripe-embedded-shell ${className}`.trim()} aria-label="Stripe secure payment">
      <CheckoutElementsProvider stripe={stripePromise} options={providerOptions}>
        <StripeCheckoutInner
          returnUrl={returnUrl}
          onError={onError}
          payLabel={payLabel}
          processingLabel={processingLabel}
          compact={compact}
        />
      </CheckoutElementsProvider>
    </div>
  );
}
