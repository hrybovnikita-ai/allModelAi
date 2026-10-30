import { Link } from 'react-router-dom';
import { useSession } from '../Session/SessionProvider';
import { AllModelAILogoMark } from '../AllModelAILogo/AllModelAILogo';
import CheckoutAiCreditPackages from './CheckoutAiCreditPackages';
import './Checkout.css';
import './CheckoutPremium.css';

export default function CheckoutCreditsPage() {
  const { status, user } = useSession();
  const sessionReady = status === 'authenticated' && Boolean(user?.email);

  return (
    <main className="checkout-page checkout-page--premium checkout-page--unified checkout-page--credits">
      <header className="checkout-credits-header">
        <Link className="checkout-summary-brand" to="/">
          <AllModelAILogoMark size={36} />
          <span>AllModelAI</span>
        </Link>
        <Link className="checkout-summary-back" to="/checkout?plan=pro">← Subscription checkout</Link>
      </header>
      <CheckoutAiCreditPackages sessionReady={sessionReady} showTestBanner={false} testBannerText="" />
    </main>
  );
}
