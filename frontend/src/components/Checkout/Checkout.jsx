import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import './Checkout.css';
import './CheckoutDemo.css';
import './CheckoutProduction.css';

const plans = {
  starter: { name: 'Starter', price: 0, perks: ['Smart chat routing', 'Gemini & Cloudflare free tier models', 'Conversation history'] },
  pro: { name: 'Pro', price: 19, perks: ['Every AI model in one place', 'Priority routing & streaming', 'AI Arena and Studio analytics'] },
  enterprise: { name: 'Enterprise', price: 49, perks: ['Team workspaces & roles', 'Admin console access', 'Knowledge base uploads'] }
};

const skills = [
  ['01', 'Multi-model chat', 'Talk to GPT, Claude, Gemini, DeepSeek and more from a single conversation.', '/chat', 'Open Chat'],
  ['02', 'AI Arena', 'Compare two models side by side and vote for the better answer.', '/arena', 'Enter the Arena'],
  ['03', 'Studio workspace', 'Save projects, track tokens and monitor usage across every model.', '/studio', 'Launch Studio']
];

export default function Checkout() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const planKey = searchParams.get('plan') || 'starter';
  const selectedPlan = plans[planKey] ? planKey : 'starter';
  const [paymentMethod, setPaymentMethod] = useState('Card');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [purchase, setPurchase] = useState(null);
  const summary = useMemo(() => plans[selectedPlan], [selectedPlan]);

  if (purchase) {
    return (
      <main className="checkout-page purchase-success-page">
        <nav className="checkout-nav">
          <Link className="checkout-brand" to="/"><span>AI</span>AllModelAI</Link>
          <Link to="/dashboard">Dashboard</Link>
        </nav>
        <p className="checkout-eyebrow">Order complete</p>
        <div className="success-mark" aria-hidden="true">&#10003;</div>
        <h1>Welcome to {summary.name}, {purchase.name}!</h1>
        <p>Your demo subscription is active. No money was charged and no card details were stored.</p>
        <div className="skill-grid">
          {skills.map(([index, title, description, to, cta]) => (
            <Link className="skill-card" key={index} to={to}>
              <span>{index}</span>
              <strong>{title}</strong>
              <small>{description}</small>
              <b>{cta} &rarr;</b>
            </Link>
          ))}
        </div>
      </main>
    );
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      setSubmitting(true);
      setError('');
      const response = await axios.post('/api/purchases', { ...payload, plan: selectedPlan }, { withCredentials: true });
      setPurchase(response.data.purchase || { name: payload.name });
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not reach the server. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="checkout-page">
      <nav className="checkout-nav">
        <Link className="checkout-brand" to="/"><span>AI</span>AllModelAI</Link>
        <Link to="/">Back to home</Link>
      </nav>

      <section className="checkout-layout">
        <div className="checkout-intro">
          <p className="checkout-eyebrow">Secure demo checkout</p>
          <h1>Unlock the full AllModelAI toolkit.</h1>
          <p>You are subscribing to the {summary.name} plan. This is a visual demo — no real payment happens and nothing sensitive is stored.</p>
          <div className="checkout-plan">
            <span>{summary.name} plan</span>
            <strong>${summary.price}<small>/month</small></strong>
          </div>
          <button type="button" onClick={() => navigate('/pricing')}>Compare all plans</button>
        </div>

        <form className="checkout-form" onSubmit={handleSubmit}>
          <h2>Billing details</h2>
          <div className="payments-disabled">
            <strong>PAYMENTS DISABLED IN DEMO</strong>
            <span>Use any sample data. Your card will never be charged.</span>
          </div>
          <div className="payment-methods" role="group" aria-label="Payment method">
            {['Card', 'PayPal', 'Bank'].map((method) => (
              <button key={method} type="button" className={paymentMethod === method ? 'active' : ''} onClick={() => setPaymentMethod(method)}>{method}</button>
            ))}
          </div>
          <label><span>Full name</span><input name="name" placeholder="Alex Morgan" autoComplete="name" required /></label>
          <label><span>Email</span><input name="email" type="email" placeholder="alex@example.com" autoComplete="email" required /></label>
          <div className="checkout-form-row">
            <label><span>City</span><input name="city" placeholder="Kyiv" autoComplete="address-level2" required /></label>
            <label><span>Date of birth</span><input name="dateOfBirth" type="date" required /></label>
          </div>
          <select name="country" defaultValue="Ukraine" aria-label="Country">
            {['Ukraine', 'Poland', 'Germany', 'United States', 'United Kingdom'].map((country) => <option key={country}>{country}</option>)}
          </select>
          {paymentMethod === 'Card' && (
            <>
              <label><span>Demo card number</span><input inputMode="numeric" placeholder="4242 4242 4242 4242" minLength="12" maxLength="23" required /></label>
              <div className="checkout-form-row">
                <label><span>Expiry</span><input placeholder="12/30" required /></label>
                <label><span>CVC</span><input inputMode="numeric" placeholder="123" maxLength="4" required /></label>
              </div>
            </>
          )}
          <label className="checkout-terms"><input type="checkbox" required /><span>I understand this is a demo checkout and no real subscription will be charged.</span></label>
          {error && <p className="checkout-error" role="alert">{error}</p>}
          <button className="pay-button" type="submit" disabled={submitting}>
            {submitting ? 'Processing...' : `Subscribe to ${summary.name}${summary.price ? ` – $${summary.price}/mo` : ' (free)'}`}
          </button>
          <p className="demo-payment-note">&#128274; Demo checkout. No transaction occurs and no data is stored.</p>
        </form>
      </section>
    </div>
  );
}
