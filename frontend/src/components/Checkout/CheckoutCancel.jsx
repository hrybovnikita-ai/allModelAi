import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AllModelAILogoMark } from '../AllModelAILogo/AllModelAILogo';
import './Checkout.css';
import './CheckoutProduction.css';

export default function CheckoutCancel() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const plan = searchParams.get('plan') || 'pro';
  const checkoutPath = plan === 'enterprise' || plan === 'plus' ? '/checkout/enterprise' : '/checkout/pro';

  return (
    <main className="checkout-page checkout-page--premium purchase-success-page">
      <nav className="checkout-nav">
        <Link className="checkout-brand" to="/"><AllModelAILogoMark />AllModelAI</Link>
      </nav>
      <p className="checkout-eyebrow">Payment cancelled</p>
      <h1>Payment wasn&apos;t completed</h1>
      <p className="checkout-success">Your account was not charged.</p>
      <button type="button" className="pay-button checkout-continue-btn" onClick={() => navigate(checkoutPath)}>
        Try again
      </button>
      <Link className="checkout-link-button" to="/pricing">Back to pricing</Link>
    </main>
  );
}
