import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiFetch } from '../../lib/api';

export default function ForgotPassword() {
  const [searchParams] = useSearchParams();

  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [step, setStep] = useState('email');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const tokenFromUrl = searchParams.get('token');

    if (tokenFromUrl) {
      setToken(tokenFromUrl);
      setStep('reset');
    }
  }, [searchParams]);

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

      const response = await apiFetch(
        '/api/auth/password-reset/request',
        {
          method: 'POST',

          headers: {
            'Content-Type': 'application/json',
          },

          body: JSON.stringify({
            email: cleanEmail,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || 'Could not create password reset request.'
        );
      }

      setMessage(
        data.message ||
          'If the account exists, a password reset request was created.'
      );

      /*
       * LOCAL DEVELOPMENT ONLY
       *
       * backend/.env:
       * EXPOSE_ACCOUNT_TOKENS=true
       *
       * Backend will return the reset token so we can test
       * Forgot Password before configuring real emails.
       */
      if (data.token) {
        setToken(data.token);
        setStep('reset');
      }
    } catch (requestError) {
      setError(
        requestError.message ||
          'Something went wrong. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async (event) => {
    event.preventDefault();

    setError('');
    setMessage('');

    if (!token.trim()) {
      setError('Reset token is missing.');
      return;
    }

    if (password.length < 8) {
      setError(
        'New password must contain at least 8 characters.'
      );
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    try {
      setLoading(true);

      const response = await apiFetch(
        '/api/auth/password-reset/confirm',
        {
          method: 'POST',

          headers: {
            'Content-Type': 'application/json',
          },

          body: JSON.stringify({
            token: token.trim(),
            password,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || 'Could not change password.'
        );
      }

      setMessage(
        data.message ||
          'Password changed successfully. You can sign in again.'
      );

      setPassword('');
      setConfirmPassword('');
      setStep('success');
    } catch (resetError) {
      setError(
        resetError.message ||
          'Could not reset password. The link may have expired.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background:
          'linear-gradient(135deg, #071020 0%, #111a3c 100%)',
        padding: '24px',
        color: '#fff',
      }}
    >
      <section
        style={{
          width: '100%',
          maxWidth: '430px',
          padding: '32px',
          borderRadius: '20px',
          background: '#151f38',
          border: '1px solid #2d3a5c',
          boxShadow: '0 24px 80px rgba(0, 0, 0, 0.35)',
        }}
      >
        <div
          style={{
            width: '42px',
            height: '42px',
            display: 'grid',
            placeItems: 'center',
            borderRadius: '12px',
            background: '#7557f6',
            fontWeight: '800',
            marginBottom: '20px',
          }}
        >
          AI
        </div>

        {step === 'email' && (
          <>
            <p
              style={{
                color: '#8ea6d9',
                fontSize: '12px',
                fontWeight: '700',
                letterSpacing: '1px',
              }}
            >
              ALLMODELAI ACCOUNT
            </p>

            <h1>Forgot password?</h1>

            <p style={{ color: '#a7b4ce' }}>
              Enter the email associated with your AllModelAI
              account.
            </p>

            <form onSubmit={requestReset}>
              <label
                style={{
                  display: 'block',
                  marginTop: '24px',
                  marginBottom: '8px',
                }}
              >
                Email
              </label>

              <input
                type="email"
                value={email}
                onChange={(event) =>
                  setEmail(event.target.value)
                }
                placeholder="you@example.com"
                autoComplete="email"
                required
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '13px',
                  borderRadius: '9px',
                  border: '1px solid #3b4967',
                  background: '#202d49',
                  color: '#fff',
                  outline: 'none',
                }}
              />

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '13px',
                  border: 0,
                  borderRadius: '9px',
                  marginTop: '18px',
                  background: '#7160f5',
                  color: '#fff',
                  fontWeight: '700',
                  cursor: loading ? 'wait' : 'pointer',
                }}
              >
                {loading
                  ? 'Creating request...'
                  : 'Reset password'}
              </button>
            </form>
          </>
        )}

        {step === 'reset' && (
          <>
            <p
              style={{
                color: '#8ea6d9',
                fontSize: '12px',
                fontWeight: '700',
                letterSpacing: '1px',
              }}
            >
              PASSWORD RECOVERY
            </p>

            <h1>Create new password</h1>

            <p style={{ color: '#a7b4ce' }}>
              Choose a new password for your AllModelAI account.
            </p>

            <form onSubmit={resetPassword}>
              <label
                style={{
                  display: 'block',
                  marginTop: '22px',
                  marginBottom: '8px',
                }}
              >
                New password
              </label>

              <input
                type="password"
                value={password}
                onChange={(event) =>
                  setPassword(event.target.value)
                }
                placeholder="At least 8 characters"
                autoComplete="new-password"
                required
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '13px',
                  borderRadius: '9px',
                  border: '1px solid #3b4967',
                  background: '#202d49',
                  color: '#fff',
                }}
              />

              <label
                style={{
                  display: 'block',
                  marginTop: '16px',
                  marginBottom: '8px',
                }}
              >
                Confirm password
              </label>

              <input
                type="password"
                value={confirmPassword}
                onChange={(event) =>
                  setConfirmPassword(event.target.value)
                }
                placeholder="Repeat your new password"
                autoComplete="new-password"
                required
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '13px',
                  borderRadius: '9px',
                  border: '1px solid #3b4967',
                  background: '#202d49',
                  color: '#fff',
                }}
              />

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '13px',
                  border: 0,
                  borderRadius: '9px',
                  marginTop: '20px',
                  background: '#7160f5',
                  color: '#fff',
                  fontWeight: '700',
                  cursor: loading ? 'wait' : 'pointer',
                }}
              >
                {loading
                  ? 'Changing password...'
                  : 'Change password'}
              </button>
            </form>
          </>
        )}

        {step === 'success' && (
          <>
            <p
              style={{
                color: '#8ea6d9',
                fontSize: '12px',
                fontWeight: '700',
                letterSpacing: '1px',
              }}
            >
              PASSWORD UPDATED
            </p>

            <h1>Password changed ✅</h1>

            <p style={{ color: '#a7b4ce' }}>
              Your new password is ready. Sign in again using the
              new password.
            </p>

            <Link
              to="/"
              style={{
                display: 'block',
                textAlign: 'center',
                padding: '13px',
                marginTop: '22px',
                borderRadius: '9px',
                background: '#7160f5',
                color: '#fff',
                fontWeight: '700',
                textDecoration: 'none',
              }}
            >
              Back to Sign in
            </Link>
          </>
        )}

        {error && (
          <div
            style={{
              marginTop: '18px',
              padding: '12px',
              borderRadius: '8px',
              background: '#421d2b',
              border: '1px solid #84364e',
              color: '#ff9eb2',
            }}
          >
            {error}
          </div>
        )}

        {message && step !== 'success' && (
          <div
            style={{
              marginTop: '18px',
              padding: '12px',
              borderRadius: '8px',
              background: '#17352e',
              border: '1px solid #286454',
              color: '#9de4cb',
            }}
          >
            {message}
          </div>
        )}

        {step !== 'success' && (
          <div
            style={{
              textAlign: 'center',
              marginTop: '22px',
            }}
          >
            <Link
              to="/"
              style={{
                color: '#a99cff',
                textDecoration: 'none',
              }}
            >
              ← Back to Sign in
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}