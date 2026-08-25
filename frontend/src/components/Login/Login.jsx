import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './Login.css';

export default function Login({ mode, onClose, onModeChange }) {
  const signingUp = mode === 'signup';
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false);

  const handleSocialSignIn = (provider) => {
    onClose();
    if (provider === 'Google') {
      window.location.assign('/api/auth/google');
      return;
    }
    navigate(`/auth/${provider.toLowerCase()}`);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const payload = Object.fromEntries(formData.entries());

    if (signingUp && payload.password !== payload.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    delete payload.confirmPassword;

    try {
      setSubmitting(true);
      setError('');
      const endpoint = signingUp ? '/api/auth/register' : '/api/auth/login';
      payload.rememberMe = true;
      const response = await axios.post(endpoint, payload, { withCredentials: true });
      sessionStorage.setItem('allmodelai_user', JSON.stringify(response.data.user));
      onClose();
      navigate('/dashboard', { state: { user: response.data.user, welcomeEmail: response.data.welcomeEmail } });
    } catch (requestError) {
      if (requestError.response?.data?.code === 'PASSWORD_SETUP_REQUIRED') {
        onModeChange('signup');
        setError('This existing account has no password yet. Enter your name, repeat the password, and press Create account.');
      } else {
        setError(requestError.response?.data?.message || 'Could not connect to the backend. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const changeMode = (nextMode) => {
    setError('');
    onModeChange(nextMode);
  };

  return (
    <div className="login-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="login-modal" role="dialog" aria-modal="true" aria-labelledby="login-title">
        <button className="login-close" onClick={onClose} aria-label="Close form">×</button>
        <span className="login-logo">AI</span>
        <p className="login-eyebrow">AllModelAI account</p>
        <h2 id="login-title">{signingUp ? 'Create your account' : 'Welcome back'}</h2>
        <p className="login-intro">{signingUp ? 'Join one workspace for every leading AI model.' : 'Sign in to continue to your AI workspace.'}</p>

        <form className="login-form" onSubmit={handleSubmit}>
          {signingUp && <label><span>Name</span><input name="name" type="text" placeholder="Your name" autoComplete="name" required /></label>}
          <label><span>Email</span><input name="email" type="email" placeholder="you@example.com" autoComplete="email" required /></label>
          <label><span>Password</span><span className="password-field"><input name="password" type={passwordVisible ? 'text' : 'password'} placeholder={signingUp ? 'Choose any password' : 'Your password'} autoComplete={signingUp ? 'new-password' : 'current-password'} required /><button type="button" className="password-toggle" onClick={() => setPasswordVisible((visible) => !visible)} aria-label={passwordVisible ? 'Hide password' : 'Show password'} aria-pressed={passwordVisible} title={passwordVisible ? 'Hide password' : 'Show password'}>{passwordVisible ? '◉' : '◎'}</button></span></label>
          {signingUp && <label><span>Confirm password</span><span className="password-field"><input name="confirmPassword" type={confirmPasswordVisible ? 'text' : 'password'} placeholder="Repeat your password" autoComplete="new-password" required /><button type="button" className="password-toggle" onClick={() => setConfirmPasswordVisible((visible) => !visible)} aria-label={confirmPasswordVisible ? 'Hide password' : 'Show password'} aria-pressed={confirmPasswordVisible} title={confirmPasswordVisible ? 'Hide password' : 'Show password'}>{confirmPasswordVisible ? '◉' : '◎'}</button></span></label>}
          {!signingUp && <a className="login-forgot" href="/forgot-password">Forgot password?</a>}
          {error && <p className="login-error" role="alert">{error}</p>}
          <button className="login-submit" type="submit" disabled={submitting}>
            {submitting ? 'Please wait...' : signingUp ? 'Create account' : 'Sign in'}
          </button>
          <div className="login-switch">
            <span>{signingUp ? 'Already have an account?' : 'New to AllModelAI?'}</span>
            <button type="button" onClick={() => changeMode(signingUp ? 'signin' : 'signup')}>{signingUp ? 'Sign in' : 'Sign up'}</button>
          </div>
        </form>

        <p className="social-title">Or continue with</p>
        <div className="login-socials">
          {['Google', 'Apple', 'Facebook'].map((provider) => <button type="button" key={provider} onClick={() => handleSocialSignIn(provider)}><img src={provider === 'Google' ? 'https://cdn.simpleicons.org/google' : provider === 'Apple' ? 'https://cdn.simpleicons.org/apple/ffffff' : 'https://cdn.simpleicons.org/facebook/1877F2'} alt="" />{provider}</button>)}
        </div>
      </section>
    </div>
  );
}
