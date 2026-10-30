import { Link } from 'react-router-dom';
import PaymentMethodBadges from './PaymentMethodBadges';
import { IconLock } from './CheckoutIcons';

export default function CheckoutPaymentUnavailable({
  message = 'Subscription checkout is not available yet.',
  detail = 'Configure Stripe or WayForPay on the server to enable secure billing. No card data is collected on this page until then.',
  testModeLabel = '',
  showPayPal = false,
  setupHint = '',
}) {
  return (
    <section className="checkout-unavailable" aria-labelledby="checkout-unavailable-title">
      <div className="production-stripe-checkout__brands">
        <p className="production-stripe-checkout__brands-label">Payment methods</p>
        <PaymentMethodBadges showPayPal={showPayPal} />
      </div>
      {testModeLabel ? (
        <p className="checkout-test-mode-inline" role="status">{testModeLabel}</p>
      ) : null}
      <h2 id="checkout-unavailable-title">Secure checkout unavailable</h2>
      <p className="checkout-unavailable__message">{message}</p>
      <p className="checkout-unavailable__detail">{detail}</p>
      {setupHint ? (
        <p className="checkout-unavailable__setup" role="note">{setupHint}</p>
      ) : null}
      <p className="checkout-unavailable__secure">
        <IconLock className="checkout-trust-icon" />
        Card details are only entered through Stripe or WayForPay when live checkout is enabled.
      </p>
      <Link className="checkout-unavailable__link" to="/checkout/credits">
        Buy prepaid AI credits instead
      </Link>
      <Link className="checkout-unavailable__link checkout-unavailable__link--muted" to="/credits">
        View credits wallet
      </Link>
    </section>
  );
}
