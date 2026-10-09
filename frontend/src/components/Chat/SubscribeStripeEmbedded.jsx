import StripeEmbeddedCheckout from '../Checkout/StripeEmbeddedCheckout';

export default function SubscribeStripeEmbedded(props) {
  return (
    <StripeEmbeddedCheckout
      {...props}
      compact
      className="subscribe-stripe-embedded-wrap"
    />
  );
}
