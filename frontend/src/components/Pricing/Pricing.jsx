import { useNavigate } from 'react-router-dom';
import './Pricing.css';

export default function Pricing() {
  const navigate = useNavigate();

  return (
    <section id="pricing" className="pricing-section">
      <div className="section-header">
        <h2>Simple, Transparent Pricing</h2>
        <p>Choose the plan that fits your integration needs</p>
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
          <button className="pricing-btn" onClick={() => navigate('/checkout?plan=developer')}>Activate developer</button>
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
          <button className="pricing-btn featured-btn" onClick={() => navigate('/checkout?plan=pro')}>Upgrade to Pro</button>
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
          <button className="pricing-btn" onClick={() => navigate('/checkout?plan=plus')}>Choose Power</button>
        </div>
      </div>
    </section>
  );
}
