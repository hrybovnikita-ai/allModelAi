import { useState } from 'react';
import axios from 'axios';
import { confirmSession } from '../../lib/session';
import './SocialAuthModal.css';

export default function SocialAuthModal({ provider, onClose, onSuccess, rememberMe = true }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [customMode, setCustomMode] = useState(false);
  const [customName, setCustomName] = useState('Nikita Hrybov');
  const [customEmail, setCustomEmail] = useState('hrybovnikita@gmail.com');

  const defaultUser = {
    name: 'Nikita Hrybov',
    email: 'hrybovnikita@gmail.com',
  };

  const handleSignIn = async (accountData) => {
    if (loading) return;
    setLoading(true);
    setError('');
    try {
      const payload = {
        provider,
        name: accountData?.name || customName || defaultUser.name,
        email: accountData?.email || customEmail || defaultUser.email,
        rememberMe,
      };

      const response = await axios.post('/api/auth/quick-social', payload, {
        withCredentials: true,
      });

      const user = await confirmSession(response.data.user);
      onSuccess(user);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Social sign-in failed');
      setLoading(false);
    }
  };

  return (
    <div className="social-modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      {/* ---------------- GOOGLE ACCOUNTS POPUP ---------------- */}
      {provider === 'Google' && (
        <div className="google-window">
          {/* Chrome titlebar */}
          <div className="google-titlebar">
            <div className="google-titlebar-left">
              <svg width="14" height="14" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              <span>Sign in - Google Accounts - Google Chrome</span>
            </div>
            <div className="google-window-controls">
              <span>─</span>
              <span>□</span>
              <button type="button" onClick={onClose}>✕</button>
            </div>
          </div>

          {/* Chrome address bar */}
          <div className="google-addressbar">
            <span className="google-lock">🔒</span>
            <span className="google-url">accounts.google.com/v3/signin/accountchooser?client_id=45716-allmodelai.com</span>
          </div>

          {/* Google Content */}
          <div className="google-body">
            <div className="google-header-logo">
              <svg width="28" height="28" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              <span>Sign in with Google</span>
            </div>

            <h1 className="google-heading">Choose an account</h1>
            <p className="google-subheading">to continue to <strong>allmodelai.com</strong></p>

            {error && <div className="google-error">{error}</div>}

            {!customMode ? (
              <div className="google-accounts-list">
                {/* Detected Account Card */}
                <button
                  type="button"
                  className="google-account-item"
                  onClick={() => handleSignIn(defaultUser)}
                  disabled={loading}
                >
                  <div className="google-avatar-circle">N</div>
                  <div className="google-account-info">
                    <span className="google-account-name">{defaultUser.name}</span>
                    <span className="google-account-email">{defaultUser.email}</span>
                  </div>
                  {loading && <span className="google-spinner"></span>}
                </button>

                <div className="google-divider"></div>

                {/* Use another account option */}
                <button
                  type="button"
                  className="google-account-item secondary"
                  onClick={() => setCustomMode(true)}
                  disabled={loading}
                >
                  <div className="google-avatar-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                    </svg>
                  </div>
                  <div className="google-account-info">
                    <span className="google-account-name">Use another account</span>
                  </div>
                </button>
              </div>
            ) : (
              <div className="google-custom-form">
                <label>
                  <span>Name:</span>
                  <input
                    type="text"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder="Your Name"
                  />
                </label>
                <label>
                  <span>Email:</span>
                  <input
                    type="email"
                    value={customEmail}
                    onChange={(e) => setCustomEmail(e.target.value)}
                    placeholder="you@gmail.com"
                  />
                </label>
                <div className="google-form-actions">
                  <button type="button" className="google-btn-back" onClick={() => setCustomMode(false)}>
                    Back
                  </button>
                  <button
                    type="button"
                    className="google-btn-submit"
                    onClick={() => handleSignIn({ name: customName, email: customEmail })}
                    disabled={loading || !customEmail.trim()}
                  >
                    {loading ? 'Signing in...' : 'Next'}
                  </button>
                </div>
              </div>
            )}

            <p className="google-disclaimer">
              Before using this app, you can review allmodelai.com's{' '}
              <a href="/privacy" target="_blank" rel="noreferrer">Privacy Policy</a> and{' '}
              <a href="/terms" target="_blank" rel="noreferrer">Terms of Service</a>.
            </p>

            <div className="google-footer">
              <span className="google-lang">English (United States) ▾</span>
              <div className="google-footer-links">
                <a href="#help">Help</a>
                <a href="#privacy">Privacy</a>
                <a href="#terms">Terms</a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- APPLE ACCOUNT POPUP ---------------- */}
      {provider === 'Apple' && (
        <div className="apple-window">
          {/* Apple header */}
          <div className="apple-header">
            <div className="apple-logo-title">
              <svg width="18" height="18" viewBox="0 0 170 170" fill="currentColor">
                <path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.19-2.12-9.97-3.17-14.34-3.17-4.58 0-9.49 1.05-14.75 3.17-5.26 2.13-9.5 3.24-12.74 3.35-4.35.13-9.16-1.9-14.42-6.08-3.69-3.04-7.67-7.81-11.96-14.34-6.42-9.88-11.53-21.43-15.34-34.66-3.8-13.23-5.71-25.71-5.71-37.45 0-14.65 3.8-26.96 11.39-36.92 7.6-9.97 17.1-15.06 28.53-15.28 4.89 0 10.43 1.3 16.63 3.91 6.2 2.61 10.27 3.97 12.22 4.08 1.41 0 5.66-1.42 12.74-4.25 7.07-2.83 13.06-4.14 17.97-3.92 13.59.65 24.38 5.66 32.38 15.02-11.85 7.18-17.67 17.08-17.45 29.69.22 9.79 3.97 17.95 11.26 24.47 7.29 6.53 15.83 10.12 25.62 10.77-2.07 6.42-4.58 13.16-7.53 20.24zM119.22 33.15c0-7.39 2.67-14.41 8.01-21.05 5.33-6.64 11.97-10.99 19.91-13.06.33 1.09.49 2.07.49 2.94 0 7.29-2.78 14.41-8.33 21.37-5.55 6.96-12.24 11.15-20.08 12.57z" />
              </svg>
              <strong>Apple Account</strong>
            </div>
            <button type="button" className="apple-close-btn" onClick={onClose}>
              Sign in
            </button>
          </div>

          <div className="apple-divider"></div>

          {/* Apple Content */}
          <div className="apple-body">
            {/* App Icon */}
            <div className="apple-app-icon">
              <span>AI</span>
            </div>

            <h2 className="apple-heading">Use your Apple Account to sign in to AllModelAI.</h2>

            {error && <div className="apple-error">{error}</div>}

            <div className="apple-input-box">
              <label>Email or Phone Number</label>
              <input
                type="text"
                value={customEmail}
                onChange={(e) => setCustomEmail(e.target.value)}
                placeholder="Email or Phone Number"
              />
            </div>

            {/* Apple privacy note */}
            <div className="apple-privacy-note">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="#0071e3">
                <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
              </svg>
              <p>
                In setting up Sign in with Apple, information about your interactions with Apple and this device may be used by Apple to help prevent fraud.{' '}
                <a href="#privacy">See how your data is managed...</a>
              </p>
            </div>

            {/* Actions */}
            <div className="apple-actions">
              <button
                type="button"
                className="apple-btn-continue"
                onClick={() => handleSignIn({ name: customName, email: customEmail })}
                disabled={loading}
              >
                {loading ? 'Signing in...' : 'Continue'}
              </button>

              <button
                type="button"
                className="apple-btn-iphone"
                onClick={() => handleSignIn({ name: customName, email: customEmail })}
                disabled={loading}
              >
                <svg width="15" height="15" viewBox="0 0 170 170" fill="currentColor">
                  <path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.19-2.12-9.97-3.17-14.34-3.17-4.58 0-9.49 1.05-14.75 3.17-5.26 2.13-9.5 3.24-12.74 3.35-4.35.13-9.16-1.9-14.42-6.08-3.69-3.04-7.67-7.81-11.96-14.34-6.42-9.88-11.53-21.43-15.34-34.66-3.8-13.23-5.71-25.71-5.71-37.45 0-14.65 3.8-26.96 11.39-36.92 7.6-9.97 17.1-15.06 28.53-15.28 4.89 0 10.43 1.3 16.63 3.91 6.2 2.61 10.27 3.97 12.22 4.08 1.41 0 5.66-1.42 12.74-4.25 7.07-2.83 13.06-4.14 17.97-3.92 13.59.65 24.38 5.66 32.38 15.02-11.85 7.18-17.67 17.08-17.45 29.69.22 9.79 3.97 17.95 11.26 24.47 7.29 6.53 15.83 10.12 25.62 10.77-2.07 6.42-4.58 13.16-7.53 20.24zM119.22 33.15c0-7.39 2.67-14.41 8.01-21.05 5.33-6.64 11.97-10.99 19.91-13.06.33 1.09.49 2.07.49 2.94 0 7.29-2.78 14.41-8.33 21.37-5.55 6.96-12.24 11.15-20.08 12.57z" />
                </svg>
                Sign in with iPhone
              </button>
              <small className="apple-iphone-note">Requires a device with iOS 17 or later.</small>
            </div>

            <div className="apple-footer">
              <span>Copyright © 2026 Apple Inc. All rights reserved.</span>
              <a href="#privacy">Privacy Policy</a>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- FACEBOOK ACCOUNT POPUP ---------------- */}
      {provider === 'Facebook' && (
        <div className="fb-window">
          {/* Facebook titlebar */}
          <div className="fb-header">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="#ffffff">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
            </svg>
            <span>Log in to Facebook</span>
            <button type="button" className="fb-close" onClick={onClose}>✕</button>
          </div>

          <div className="fb-body">
            <h2 className="fb-heading">Log in to Facebook</h2>
            <p className="fb-subheading">Use your Facebook account to sign in to <strong>AllModelAI</strong>.</p>

            {error && <div className="fb-error">{error}</div>}

            <div className="fb-account-card">
              <div className="fb-avatar">N</div>
              <div className="fb-account-meta">
                <strong>{defaultUser.name}</strong>
                <span>{defaultUser.email}</span>
              </div>
            </div>

            <button
              type="button"
              className="fb-btn-continue"
              onClick={() => handleSignIn(defaultUser)}
              disabled={loading}
            >
              {loading ? 'Signing in...' : 'Continue as Nikita'}
            </button>

            <div className="fb-or-divider">
              <span>or</span>
            </div>

            <button
              type="button"
              className="fb-btn-other"
              onClick={() => handleSignIn({ name: 'Facebook User', email: 'facebook.user@example.com' })}
              disabled={loading}
            >
              Log into another account
            </button>

            <p className="fb-privacy-footer">
              AllModelAI will receive your name, profile picture, and email address.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
