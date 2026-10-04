import { applyAuthResponsePayload, confirmSession } from '../../lib/session';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { AllModelAILogoMark } from '../AllModelAILogo/AllModelAILogo';
import { authPost } from '../../lib/authApi';
import { validateRegistrationForm } from '../../lib/authValidation';
import { isFirebaseSocialConfigured } from '../../lib/firebase';
import { socialSignIn, SOCIAL_PROVIDERS } from '../../lib/socialSignIn';
import { socialError } from '../../lib/socialSession';
import './Login.css';

const GITHUB_ICON = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 0C5.37 0 0 5.373 0 12c0 5.303 3.438 9.8 8.205 11.387.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.09-.745.083-.73.083-.73 1.205.085 1.84 1.237 1.84 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.605-2.665-.303-5.466-1.332-5.466-5.93 0-1.31.468-2.38 1.236-3.22-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23a11.5 11.5 0 0 1 3.003-.404c1.02.005 2.047.138 3.003.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.91 1.235 3.22 0 4.61-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222 0 1.606-.015 2.896-.015 3.286 0 .315.21.694.825.576C20.565 21.795 24 17.298 24 12c0-6.627-5.373-12-12-12z" />
  </svg>
);

const PROVIDER_ICONS = {
  Google: 'https://cdn.simpleicons.org/google',
  Apple: 'https://cdn.simpleicons.org/apple/ffffff',
};

export default function Login(props) {
  return <LoginForm {...props} />;
}

function LoginForm({
  mode,
  onClose,
  onModeChange,
  returnTo = '/dashboard',
  returnState,
}) {
  const signingUp = mode === 'signup';
  const navigate = useNavigate();

  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [socialBusy, setSocialBusy] = useState(null);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false);
  const [successNotice, setSuccessNotice] = useState('');
  const firebaseSocialReady = isFirebaseSocialConfigured();

  const handleSocialSignIn = async (provider) => {
    if (submitting || socialBusy) return;
    setError('');
    setSocialBusy(provider);
    try {
      const outcome = await socialSignIn(provider, { rememberMe });
      if (outcome?.redirected) {
        return;
      }
      const user = outcome;
      document.activeElement?.blur();
      navigate('/dashboard', { replace: true, state: { user } });
    } catch (requestError) {
      setError(socialError(requestError));
    } finally {
      setSocialBusy(null);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccessNotice('');

    const formData = new FormData(event.currentTarget);
    const raw = Object.fromEntries(formData.entries());
    let payload;

    if (signingUp) {
      const validation = validateRegistrationForm({
        name: raw.name,
        email: raw.email,
        password: raw.password,
        confirmPassword: raw.confirmPassword,
      });
      if (!validation.ok) {
        setError(validation.message);
        return;
      }
      payload = { ...validation.payload, rememberMe };
    } else {
      if (!String(raw.email || '').trim()) {
        setError('Please enter your email address.');
        return;
      }
      if (!raw.password) {
        setError('Please enter a password.');
        return;
      }
      payload = {
        email: String(raw.email).trim().toLowerCase(),
        password: raw.password,
        rememberMe,
      };
    }

    const destination = signingUp ? '/dashboard' : returnTo;

    try {
      setSubmitting(true);

      const { data } = await authPost(
        signingUp ? 'register' : 'login',
        payload,
      );

      applyAuthResponsePayload(data);
      const user = await confirmSession(data.user);

      document.activeElement?.blur();

      if (signingUp) {
        setSuccessNotice('Welcome to AllModelAI');
      }

      navigate(destination, {
        replace: true,
        state: {
          ...returnState,
          user,
          welcomeEmail: data.welcomeEmail,
        },
      });
    } catch (requestError) {
      if (requestError.code === 'PASSWORD_SETUP_REQUIRED' && !signingUp) {
        setError(
          requestError.message ||
            'This account has no password yet. Use social sign-in or reset your password.',
        );
      } else if (requestError.code === 'SOCIAL_ACCOUNT_EXISTS') {
        setError(requestError.message);
      } else if (requestError.code === 'EMAIL_ALREADY_EXISTS' || requestError.status === 409) {
        setError(
          requestError.message ||
            'An account with this email already exists. Sign in instead.',
        );
      } else if (
        !signingUp
        && requestError.message?.toLowerCase().includes('could not be verified')
      ) {
        setError(
          'Sign-in reached the server but your session could not be verified. Check that VITE_API_BASE_URL points to your Render backend and that Render allows cross-site cookies (COOKIE_SAME_SITE=none, COOKIE_SECURE=true, FRONTEND_ORIGIN).',
        );
      } else if (requestError.status === 401 && !signingUp) {
        setError('Incorrect email or password');
      } else if (requestError.message?.includes('Failed to fetch')) {
        setError(
          signingUp
            ? 'Registration service is temporarily unavailable. Please try again.'
            : 'Could not reach the authentication server. Check your connection or API configuration.',
        );
      } else {
        setError(
          requestError.message ||
            'Could not connect to the backend. Please try again.',
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  const changeMode = (nextMode) => {
    setError('');
    onModeChange(nextMode);
  };

  useEffect(() => {
    const closeWithEscape = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', closeWithEscape);
    return () => document.removeEventListener('keydown', closeWithEscape);
  }, [onClose]);

  const socialDisabled = submitting || Boolean(socialBusy);

  const modalTree = (
    <div className="login-overlay" role="presentation">
      <div
        className="login-backdrop-layer"
        aria-hidden="true"
        onMouseDown={onClose}
      />
      <section
        className="login-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          className="login-close"
          type="button"
          onClick={onClose}
          aria-label="Close form"
        >
          ×
        </button>

        <AllModelAILogoMark className="login-logo" size={42} />

        <p className="login-eyebrow">AllModelAI account</p>

        <h2 id="login-title">
          {signingUp ? 'Create your account' : 'Welcome to AllModelAI'}
        </h2>

        <p className="login-intro">
          {signingUp
            ? 'Join one workspace for every leading AI model.'
            : 'Sign in to access your AI workspace.'}
        </p>

        <form className="login-form" onSubmit={handleSubmit}>
          {signingUp && (
            <label>
              <span>Name</span>
              <input
                name="name"
                type="text"
                placeholder="Your name"
                autoComplete="name"
                required
              />
            </label>
          )}

          <label>
            <span>Email</span>
            <input
              name="email"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
          </label>

          <label>
            <span>Password</span>
            <span className="password-field">
              <input
                name="password"
                type={passwordVisible ? 'text' : 'password'}
                placeholder={signingUp ? 'Choose a password' : 'Your password'}
                autoComplete={signingUp ? 'new-password' : 'current-password'}
                required
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setPasswordVisible((visible) => !visible)}
                aria-label={passwordVisible ? 'Hide password' : 'Show password'}
                aria-pressed={passwordVisible}
              >
                {passwordVisible ? '◉' : '◎'}
              </button>
            </span>
          </label>

          {signingUp && (
            <label>
              <span>Confirm password</span>
              <span className="password-field">
                <input
                  name="confirmPassword"
                  type={confirmPasswordVisible ? 'text' : 'password'}
                  placeholder="Repeat your password"
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() =>
                    setConfirmPasswordVisible((visible) => !visible)
                  }
                  aria-label={
                    confirmPasswordVisible ? 'Hide password' : 'Show password'
                  }
                  aria-pressed={confirmPasswordVisible}
                >
                  {confirmPasswordVisible ? '◉' : '◎'}
                </button>
              </span>
            </label>
          )}

          <label className="login-remember">
            <input
              name="rememberMe"
              type="checkbox"
              checked={rememberMe}
              onChange={(event) => setRememberMe(event.target.checked)}
            />
            Remember me
          </label>

          {!signingUp && (
            <a className="login-forgot" href="/forgot-password">
              Forgot password?
            </a>
          )}

          {successNotice && (
            <p className="login-success" role="status">
              {successNotice}
            </p>
          )}

          {error && (
            <p className="login-error" role="alert">
              {error}
            </p>
          )}

          <button
            className="login-submit"
            type="submit"
            disabled={socialDisabled}
          >
            {submitting
              ? signingUp
                ? 'Creating account…'
                : 'Signing in…'
              : signingUp
                ? 'Create account'
                : 'Sign in'}
          </button>

          <div className="login-switch">
            <span>
              {signingUp ? 'Already have an account?' : 'New to AllModelAI?'}
            </span>
            <button
              type="button"
              onClick={() => changeMode(signingUp ? 'signin' : 'signup')}
            >
              {signingUp ? 'Sign in' : 'Sign up'}
            </button>
          </div>
        </form>

        <div className="login-divider" role="separator">
          <span>or</span>
        </div>

        <div className="login-socials" role="group" aria-label="Social sign-in">
          {!firebaseSocialReady && (
            <p className="login-social-config-hint" role="status">
              Social sign-in requires VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN,
              VITE_FIREBASE_PROJECT_ID, and VITE_FIREBASE_APP_ID in your deployment environment.
            </p>
          )}
          {SOCIAL_PROVIDERS.map((provider) => {
            const busy = socialBusy === provider;
            const icon = provider === 'GitHub'
              ? GITHUB_ICON
              : <img src={PROVIDER_ICONS[provider]} alt="" />;
            return (
              <button
                type="button"
                key={provider}
                className={`login-social-btn login-social-btn--${provider.toLowerCase()}`}
                disabled={socialDisabled || !firebaseSocialReady}
                aria-busy={busy}
                title={!firebaseSocialReady ? 'Firebase web configuration is missing' : undefined}
                onClick={() => handleSocialSignIn(provider)}
              >
                {icon}
                <span>
                  {busy
                    ? `Connecting to ${provider}…`
                    : `Continue with ${provider}`}
                </span>
                {busy && <span className="login-social-spinner" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );

  return createPortal(modalTree, document.body);
}
