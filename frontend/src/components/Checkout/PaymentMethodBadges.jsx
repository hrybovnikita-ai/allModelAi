import './PaymentMethodBadges.css';

const WALLET_BADGES = [
  { id: 'visa', label: 'Visa', src: '/payment-badges/visa.png' },
  { id: 'mastercard', label: 'Mastercard', src: '/payment-badges/mastercard.png' },
  { id: 'apple-pay', label: 'Apple Pay', src: '/payment-badges/apple-pay.png' },
  { id: 'google-pay', label: 'Google Pay', src: '/payment-badges/google-pay.png' },
  { id: 'paypal', label: 'PayPal', src: '/payment-badges/paypal.png', paypalOnly: true },
];

export default function PaymentMethodBadges({ className = '', showPayPal = false }) {
  const badges = WALLET_BADGES.filter((badge) => !badge.paypalOnly || showPayPal);
  return (
    <div className={`checkout-payment-badges ${className}`.trim()} aria-label="Accepted payment methods">
      {badges.map((badge) => (
        <span key={badge.id} className="checkout-payment-badges__item" title={badge.label}>
          <img src={badge.src} alt="" loading="lazy" decoding="async" />
          <span className="sr-only">{badge.label}</span>
        </span>
      ))}
    </div>
  );
}
