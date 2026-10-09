export default function PaymentButton({
  children,
  loading = false,
  loadingLabel = 'Processing payment…',
  disabled = false,
  type = 'button',
  variant = 'primary',
  className = '',
  ...rest
}) {
  const variantClass = variant === 'secondary'
    ? 'payment-button--secondary pay-button--secondary'
    : 'payment-button--primary';

  return (
    <button
      type={type}
      className={`payment-button pay-button ${variantClass} ${className}`.trim()}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? (
        <span className="payment-button__inner">
          <span className="payment-button__spinner" aria-hidden="true" />
          {loadingLabel}
        </span>
      ) : (
        children
      )}
    </button>
  );
}
