export default function PaymentFormCard({ children, className = '', light = false }) {
  return (
    <section
      className={[
        'checkout-form-panel',
        'glass-panel',
        'checkout-payment-card',
        'payment-form-card',
        light ? 'payment-form-card--light' : '',
        className,
      ].filter(Boolean).join(' ')}
    >
      <div className="payment-form-card__glow" aria-hidden="true" />
      {children}
    </section>
  );
}
