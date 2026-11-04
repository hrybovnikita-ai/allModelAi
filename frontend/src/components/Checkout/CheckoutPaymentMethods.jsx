import CardBrandBadges from './CardBrandBadges';

/**
 * Describes payment methods enabled by the active provider — no simulated wallet buttons.
 */
export default function CheckoutPaymentMethods({ checkoutInfo, className = '' }) {
  if (!checkoutInfo?.checkoutAvailable) return null;

  const provider = checkoutInfo.primaryProvider;
  const note = checkoutInfo.supportedPaymentMethodsNote;

  if (provider === 'stripe') {
    return (
      <div className={`checkout-payment-methods ${className}`.trim()} role="note">
        <p className="checkout-payment-methods__label">Available payment methods</p>
        <div className="checkout-payment-methods__row">
          <CardBrandBadges className="checkout-payment-methods__badges" />
        </div>
        <p className="checkout-payment-methods__hint">
          {note || 'Cards and wallets supported by Stripe appear in the secure form below (including Apple Pay and Google Pay when your browser and device support them).'}
        </p>
      </div>
    );
  }

  if (provider === 'wayforpay') {
    return (
      <div className={`checkout-payment-methods ${className}`.trim()} role="note">
        <p className="checkout-payment-methods__label">Available payment methods</p>
        <div className="checkout-payment-methods__row">
          <CardBrandBadges className="checkout-payment-methods__badges" />
        </div>
        <p className="checkout-payment-methods__hint">
          {note || 'Visa, MasterCard, Apple Pay, and Google Pay through WayForPay secure checkout when enabled on your merchant account.'}
        </p>
      </div>
    );
  }

  if (provider === 'paddle') {
    return (
      <div className={`checkout-payment-methods ${className}`.trim()} role="note">
        <p className="checkout-payment-methods__label">Available payment methods</p>
        <p className="checkout-payment-methods__hint">
          {note || 'Cards and wallets supported by Paddle appear on their secure checkout overlay.'}
        </p>
      </div>
    );
  }

  if (provider === 'lemonsqueezy') {
    return (
      <div className={`checkout-payment-methods ${className}`.trim()} role="note">
        <p className="checkout-payment-methods__label">Available payment methods</p>
        <p className="checkout-payment-methods__hint">
          {note || 'Cards and PayPal through Lemon Squeezy secure checkout.'}
        </p>
      </div>
    );
  }

  if (!note) return null;

  return (
    <div className={`checkout-payment-methods ${className}`.trim()} role="note">
      <p className="checkout-payment-methods__hint">{note}</p>
    </div>
  );
}
