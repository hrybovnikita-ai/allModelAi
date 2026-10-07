import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchCheckoutInfo, TEST_MODE_BANNER } from '../../lib/paymentCheckoutInfo';
import './Pricing.css';

export default function Pricing() {
  const navigate = useNavigate();
  const [banner, setBanner] = useState({ showTestBanner: false, testBannerText: TEST_MODE_BANNER });

  useEffect(() => {
    fetchCheckoutInfo().then((info) => {
      setBanner({
        showTestBanner: Boolean(info?.showTestModeBanner),
        testBannerText: info?.testModeBannerText || TEST_MODE_BANNER,
      });
    });
  }, []);

  return (
    <section id="pricing" className="pricing-section">
      <div className="section-header">
        <h2>Simple, Transparent Pricing</h2>
        <p>Choose the plan that fits your integration needs</p>
        {banner.showTestBanner && (
          <p className="pricing-test-mode-banner" role="status">{banner.testBannerText}</p>
        )}
      </div>
      <div className="pricing-grid">
        <div className="pricing-card">
          <span className="pricing-tier">Developer</span>
          <div className="price">$0<span>/month</span></div>
          <p className="price-desc">Free access for configured developer accounts</p>
          <ul className="pricing-features">
            <li>Access to all connected models</li>
            <li>5,000 requests per month</li>
            <li>Code Studio and Live Preview</li>
          </ul>
          <button className="pricing-btn" type="button" onClick={() => navigate('/checkout?plan=developer')}>Activate Developer</button>
        </div>
        <div className="pricing-card featured">
          <span className="featured-badge">Most Popular</span>
          <span className="pricing-tier">Pro</span>
          <div className="price">$19<span>/month</span></div>
          <p className="price-desc">Ideal for power users and small teams deploying products</p>
          <ul className="pricing-features">
            <li>Access to premium & standard models</li>
            <li>3,000 requests per month</li>
            <li>Priority API routing</li>
            <li>Email support</li>
          </ul>
          <button className="pricing-btn featured-btn" type="button" onClick={() => navigate('/checkout/pro')}>Upgrade to Pro</button>
        </div>
        <div className="pricing-card">
          <span className="pricing-tier">Enterprise</span>
          <div className="price">$49<span>/month</span></div>
          <p className="price-desc">Designed for high-scale applications and full support</p>
          <ul className="pricing-features">
            <li>12,000 requests across all models</li>
            <li>Dedicated support manager</li>
            <li>Custom SLA guarantees</li>
            <li>Self-hosting options</li>
          </ul>
          <button className="pricing-btn" type="button" onClick={() => navigate('/checkout/enterprise')}>Choose Enterprise</button>
        </div>
      </div>
    </section>
  );
}
