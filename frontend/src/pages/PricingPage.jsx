import Header from '../components/Header/Header';
import Footer from '../components/Footer/Footer';
import Pricing from '../components/Pricing/Pricing';

export default function PricingPage() {
  return (
    <>
      <Header />
      <main className="pricing-page-shell">
        <Pricing />
      </main>
      <Footer />
    </>
  );
}
