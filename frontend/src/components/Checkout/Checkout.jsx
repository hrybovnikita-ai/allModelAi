import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import './Checkout.css';

const plans = {
  starter: { name: 'Free', price: '$0/mo' },
  pro: { name: 'Common', price: '$14.99/month' },
  enterprise: { name: 'Plus', price: '$29.99/month' },
};

const skills = [
  { icon: '✦', name: 'Creative writing', description: 'Turn rough ideas into polished stories and campaigns.', link: '/chat?model=claude' },
  { icon: '</>', name: 'Code builder', description: 'Create, explain, and improve code with an AI pair programmer.', link: '/chat?model=gpt' },
  { icon: '◎', name: 'Research lab', description: 'Summarize complex topics and discover useful connections.', link: '/chat?model=gemini' },
];

export default function Checkout() {
  const [searchParams] = useSearchParams();
  const plan = plans[searchParams.get('plan')] || plans.pro;
  const [purchased, setPurchased] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const submitPurchase = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      const formData = new FormData(event.currentTarget);
      const customerDetails = Object.fromEntries([...formData.entries()].filter(([field]) => !['cardNumber', 'expiry', 'cvc'].includes(field)));
      const response = await fetch('/api/purchases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...customerDetails, plan: plan.name }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Could not save your purchase.');
      setPurchased(true);
      event.currentTarget.reset();
    } catch (requestError) {
      setError(requestError.message || 'Could not connect to the backend.');
    } finally {
      setSubmitting(false);
    }
  };

  if (purchased) {
    return (
      <main className="checkout-page">
        <nav className="checkout-nav">
          <Link to="/" className="checkout-brand"><span>AI</span>AllModelAI</Link>
          <Link to="/dashboard">Open dashboard</Link>
        </nav>
        <section className="purchase-success-page">
          <p className="checkout-eyebrow">Purchase complete</p>
          <div className="success-mark">✓</div>
          <h1>Thanks for the purchase!</h1>
          <p>Your {plan.name} demo workspace is ready. No payment was processed.</p>
          <div className="skill-grid">{skills.map((skill) => <Link className="skill-card" to={skill.link} key={skill.name}><span>{skill.icon}</span><strong>{skill.name}</strong><small>{skill.description}</small><b>Try this skill →</b></Link>)}</div>
        </section>
      </main>
    );
  }

  return (
    <main className="checkout-page">
      <nav className="checkout-nav">
        <Link to="/" className="checkout-brand"><span>AI</span>AllModelAI</Link>
        <Link to="/#pricing">Back to pricing</Link>
      </nav>
      <section className="checkout-layout">
        <div className="checkout-intro">
          <p className="checkout-eyebrow">Simulated purchase</p>
          <h1>Activate your {plan.name} plan.</h1>
          <p>Complete this demo form to continue. No payment is processed and no card details are requested.</p>
          <div className="checkout-plan"><span>{plan.name}</span><strong>{plan.price}</strong></div>
        </div>
        <form className="checkout-form" onSubmit={submitPurchase}>
          <h2>Demo payment details</h2>
          <p className="demo-payment-note">Test mode only. Card information is checked in your browser and never sent or stored.</p>
          <label>Name<input name="name" type="text" required autoComplete="name" /></label>
          <label>Email<input name="email" type="email" required autoComplete="email" /></label>
          <label>Card number<input name="cardNumber" inputMode="numeric" pattern="[0-9 ]{13,19}" placeholder="4242 4242 4242 4242" required autoComplete="cc-number" /></label>
          <div className="checkout-form-row"><label>Expiry<input name="expiry" type="text" pattern="(0[1-9]|1[0-2])/[0-9]{2}" placeholder="MM/YY" required autoComplete="cc-exp" /></label><label>CVC<input name="cvc" type="password" inputMode="numeric" pattern="[0-9]{3,4}" placeholder="123" required autoComplete="cc-csc" /></label></div>
          <label>Password<input name="password" type="password" required minLength="6" autoComplete="new-password" /></label>
          <label>City<input name="city" type="text" required autoComplete="address-level2" /></label>
          <label>Date of birth<input name="dateOfBirth" type="date" required /></label>
          <button type="submit" disabled={submitting}>{submitting ? 'Saving...' : `Buy ${plan.name}`}</button>
          {error && <p className="checkout-error" role="alert">{error}</p>}
          {purchased && <p className="checkout-success" role="status">Thanks for the purchase!</p>}
        </form>
      </section>
    </main>
  );
}