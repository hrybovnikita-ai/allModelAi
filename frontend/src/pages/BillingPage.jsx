import { Link } from 'react-router-dom';
import Header from '../components/Header/Header';
import Footer from '../components/Footer/Footer';
import SettingsBillingPanel from '../components/Settings/SettingsBillingPanel';
import '../components/Checkout/CheckoutPremium.css';
import './BillingPage.css';

export default function BillingPage() {
  return (
    <>
      <Header />
      <main className="billing-page checkout-page checkout-page--premium">
        <div className="billing-page-inner">
          <header className="billing-page-header">
            <p className="checkout-eyebrow">Account</p>
            <h1>Billing & subscription</h1>
            <p className="billing-page-lede">
              View your plan, renewals, and payment history. Premium access activates only after verified payment.
            </p>
          </header>
          <SettingsBillingPanel />
          <div className="billing-page-links">
            <Link className="pay-button checkout-continue-btn billing-page-cta" to="/dashboard/orders">
              Payment history
            </Link>
            <Link className="billing-page-secondary" to="/checkout/pro">
              Upgrade to Pro
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
