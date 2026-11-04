import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { sendPasswordResetEmail } from 'firebase/auth';
import { apiFetch, parseJsonResponse } from '../../lib/api';
import { ensureSocialAuthReady, isFirebaseSocialConfigured } from '../../lib/firebase';
import { AllModelAILogoMark } from '../AllModelAILogo/AllModelAILogo';
import '../Login/login-premium.css';
import './ForgotPassword.css';

export default function ForgotPassword() {
  const [searchParams] = useSearchParams();

  const tokenFromUrl = searchParams.get('token') || '';

  const [email, setEmail] = useState('');
  const [token, setToken] = useState(() => tokenFromUrl);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [step, setStep] = useState(() => (tokenFromUrl ? 'reset' : 'email'));
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const requestReset = async (event) => {
    event.preventDefault();

    setError('');
    setMessage('');

    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      setError('Enter your email address.');
      return;
    }

    try {
      setLoading(true);

      const response = await apiFetch('/api/auth/password-reset/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: cleanEmail,
        }),
      });

      const data = await parseJsonResponse(response);

      if (!response.ok) {
        throw new Error(data.message || 'Could not create password reset request.');
      }

      if (isFirebaseSocialConfigured()) {
        try {
          const auth = await ensureSocialAuthReady();
          await sendPasswordResetEmail(auth, cleanEmail);
        } catch {
          /* Backend reset is the AllModelAI source of truth. */
        }
      }

      const baseMessage =
        data.message || 'If the account exists, a password reset request was created.';
      const needsLocalSetupHint =
        data.emailDeliveryConfigured === false && !data.token;
      setMessage(
        needsLocalSetupHint
          ? `${baseMessage} Sign in with Google, then set an AllModelAI password in Settings → Security.`
          : baseMessage,
      );

      if (data.token) {
        setToken(data.token);
        setStep('reset');
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Something went wrong. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async (event) => {
    event.preventDefault();

    setError('');
    setMessage('');

    const cleanToken = token.trim();

    if (!cleanToken) {
      setError('Reset token is missing.');
      return;
    }

    if (password.length < 8) {
      setError('New password must contain at least 8 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    try {
      setLoading(true);

      const response = await apiFetch('/api/auth/password-reset/confirm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token: cleanToken,
          password,
          confirmPassword,
        }),
      });

      const data = await parseJsonResponse(response);

      if (!response.ok) {
        throw new Error(data.message || 'Could not change password.');
      }

      setMessage(data.message || 'Password changed successfully. You can sign in again.');

      setPassword('');
      setConfirmPassword('');
      setStep('success');
    } catch (resetError) {
      setError(
        resetError instanceof Error
          ? resetError.message
          : 'Could not reset password. The link may have expired.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="forgot-page">
      <section className="forgot-shell" aria-labelledby="forgot-title">
        <AllModelAILogoMark className="login-logo" size={48} />

        {step === 'email' && (
          <>
            <p className="auth-eyebrow">AllModelAI account</p>
            <h1 id="forgot-title">Forgot password?</h1>
            <p>Enter the email associated with your AllModelAI account.</p>
            <p className="forgot-note">
              Signed up with Google only? You can still create an AllModelAI password here. We send a secure link to
              your email — we never ask for your Google password.
            </p>

            <form onSubmit={requestReset}>
              <label htmlFor="forgot-password-email">
                <span>Email</span>
                <input
                  id="forgot-password-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                  disabled={loading}
                />
              </label>

              <button type="submit" disabled={loading} aria-busy={loading}>
                {loading ? 'Creating request…' : 'Reset password'}
              </button>
            </form>
          </>
        )}

        {step === 'reset' && (
          <>
            <p className="auth-eyebrow">Password recovery</p>
            <h1 id="forgot-title">Create new password</h1>
            <p>Choose a new password for your AllModelAI account.</p>

            <form onSubmit={resetPassword}>
              <label htmlFor="new-password">
                <span>New password</span>
                <input
                  id="new-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  disabled={loading}
                />
              </label>

              <label htmlFor="confirm-password">
                <span>Confirm password</span>
                <input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Repeat your new password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  disabled={loading}
                />
              </label>

              <button type="submit" disabled={loading} aria-busy={loading}>
                {loading ? 'Changing password…' : 'Change password'}
              </button>
            </form>
          </>
        )}

        {step === 'success' && (
          <>
            <p className="auth-eyebrow">Password updated</p>
            <h1 id="forgot-title">Password changed</h1>
            <p>Your new password is ready. Sign in again using the new password.</p>
            <Link className="forgot-cta-link" to="/">
              Back to Sign in
            </Link>
          </>
        )}

        {error ? (
          <div className="forgot-alert forgot-alert--error" role="alert">
            {error}
          </div>
        ) : null}

        {message && step !== 'success' ? (
          <div className="forgot-alert forgot-alert--success" role="status" aria-live="polite">
            {message}
          </div>
        ) : null}

        {step !== 'success' ? (
          <p className="forgot-back">
            <Link className="forgot-link" to="/">
              ← Back to Sign in
            </Link>
          </p>
        ) : null}
      </section>
    </main>
  );
}
