import { useCallback, useMemo, useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import {
  CheckoutElementsProvider,
  ExpressCheckoutElement,
  PaymentElement,
  useCheckoutElements,
} from '@stripe/react-stripe-js/checkout';

const checkoutAppearance = {
  theme: 'night',
  variables: {
    colorPrimary: '#b794ff',
    colorBackground: '#121212',
    colorText: '#f2f2f2',
    colorDanger: '#ff6b8a',
    borderRadius: '10px',
  },
};

function SubscribeCheckoutInner({ returnUrl, onError, payLabel, processingLabel }) {
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
    return null;
  }

  if (checkoutState.type === 'error') {
    onError?.(checkoutState.error.message);
    return null;
  }

  return (
    <div className="subscribe-stripe-custom">
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
        <p className="subscribe-stripe-wallets-hint" aria-hidden="true">
          Apple Pay · Google Pay
        </p>
      )}
      <div className="subscribe-stripe-divider">
        <span>Card</span>
      </div>
      <PaymentElement options={{ layout: 'tabs' }} />
      <button
        type="button"
        className="subscribe-confirm subscribe-confirm-inline"
        disabled={payBusy}
        onClick={handleCardPay}
      >
        {payBusy ? processingLabel : payLabel}
      </button>
    </div>
  );
}

export default function SubscribeStripeEmbedded({
  publishableKey,
  clientSecret,
  returnUrl,
  onError,
  payLabel = 'Subscribe',
  processingLabel = 'Processing…',
}) {
  const stripePromise = useMemo(() => {
    if (!publishableKey) return null;
    return loadStripe(publishableKey);
  }, [publishableKey]);

  const providerOptions = useMemo(
    () => ({
      clientSecret,
      elementsOptions: { appearance: checkoutAppearance, loader: 'auto' },
    }),
    [clientSecret],
  );

  if (!publishableKey || !clientSecret || !stripePromise || !returnUrl) {
    return null;
  }

  return (
    <div className="subscribe-stripe-embedded" aria-label="Stripe secure payment form">
      <CheckoutElementsProvider stripe={stripePromise} options={providerOptions}>
        <SubscribeCheckoutInner
          returnUrl={returnUrl}
          onError={onError}
          payLabel={payLabel}
          processingLabel={processingLabel}
        />
      </CheckoutElementsProvider>
    </div>
  );
}
