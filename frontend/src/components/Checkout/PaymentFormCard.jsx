export default function PaymentFormCard({ children, className = '' }) {
  return (
    <section className={`checkout-form-panel glass-panel checkout-payment-card payment-form-card ${className}`.trim()}>
      <div className="payment-form-card__glow" aria-hidden="true" />
      {children}
    </section>
  );
}
