import { useState } from 'react';
import { Link } from 'react-router-dom';
import './ForgotPassword.css';

export default function ForgotPassword() {
  const [sent, setSent] = useState(false);
  return <main className="forgot-page"><section><Link to="/" className="forgot-brand">AllModelAI</Link>{sent ? <><h1>Check your email.</h1><p>If an account exists for this address, we will send password reset instructions.</p><Link to="/" className="forgot-link">Back to sign in</Link></> : <><span>Account recovery</span><h1>Reset your password.</h1><p>Enter your email and we will prepare a secure reset link.</p><form onSubmit={(event) => { event.preventDefault(); setSent(true); }}><label>Email address<input type="email" required autoComplete="email" placeholder="you@example.com" /></label><button type="submit">Send reset link</button></form><Link to="/" className="forgot-link">Back to sign in</Link></>}</section></main>;
}
