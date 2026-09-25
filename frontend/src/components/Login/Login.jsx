import { confirmSession } from '../../lib/session';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import SocialAuthModal from './SocialAuthModal';
import { AllModelAILogoMark } from '../AllModelAILogo/AllModelAILogo';
import axios from 'axios';
import './Login.css';

export default function Login(props) {
  return <LoginForm {...props} />;
}

function LoginForm({
  mode,
  onClose,
  onModeChange,
  returnTo = '/chat',
  returnState,
}) {
  const signingUp = mode === 'signup';
  const navigate = useNavigate();

  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false);
  const [activeSocialProvider, setActiveSocialProvider] = useState(null);

  const handleSocialSignIn = (provider) => {
    setError('');
    setActiveSocialProvider(provider);
  };

  const handleSocialSuccess = (user) => {
    setActiveSocialProvider(null);
    document.activeElement?.blur();

    navigate('/dashboard', {
      replace: true,
      state: { user },
    });
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

      const endpoint = signingUp
        ? '/api/auth/register'
        : '/api/auth/login';

      payload.rememberMe = payload.rememberMe === 'on';

      const response = await axios.post(endpoint, payload, {
        withCredentials: true,
      });

      const user = await confirmSession(response.data.user);

      document.activeElement?.blur();

      navigate(returnTo, {
        replace: true,
        state: {
          ...returnState,
          user,
          welcomeEmail: response.data.welcomeEmail,
        },
      });
    } catch (requestError) {
      if (
        requestError.response?.data?.code ===
        'PASSWORD_SETUP_REQUIRED'
      ) {
        setError(
          'Use your original sign-in provider or the password recovery flow for this account.',
        );
      } else {
        setError(
          requestError.response?.data?.message ||
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

        <p className="login-eyebrow">
          AllModelAI account
        </p>

        <h2 id="login-title">
          {signingUp
            ? 'Create your account'
            : 'Welcome to AllModelAI'}
        </h2>

        <p className="login-intro">
          {signingUp
            ? 'Join one workspace for every leading AI model.'
            : 'Sign in to access your AI workspace.'}
        </p>

        <form
          className="login-form"
          onSubmit={handleSubmit}
        >
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
                type={
                  passwordVisible
                    ? 'text'
                    : 'password'
                }
                placeholder={
                  signingUp
                    ? 'Choose any password'
                    : 'Your password'
                }
                autoComplete={
                  signingUp
                    ? 'new-password'
                    : 'current-password'
                }
                required
              />

              <button
                type="button"
                className="password-toggle"
                onClick={() =>
                  setPasswordVisible(
                    (visible) => !visible,
                  )
                }
                aria-label={
                  passwordVisible
                    ? 'Hide password'
                    : 'Show password'
                }
                aria-pressed={passwordVisible}
                title={
                  passwordVisible
                    ? 'Hide password'
                    : 'Show password'
                }
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
                  type={
                    confirmPasswordVisible
                      ? 'text'
                      : 'password'
                  }
                  placeholder="Repeat your password"
                  autoComplete="new-password"
                  required
                />

                <button
                  type="button"
                  className="password-toggle"
                  onClick={() =>
                    setConfirmPasswordVisible(
                      (visible) => !visible,
                    )
                  }
                  aria-label={
                    confirmPasswordVisible
                      ? 'Hide password'
                      : 'Show password'
                  }
                  aria-pressed={
                    confirmPasswordVisible
                  }
                  title={
                    confirmPasswordVisible
                      ? 'Hide password'
                      : 'Show password'
                  }
                >
                  {confirmPasswordVisible
                    ? '◉'
                    : '◎'}
                </button>
              </span>
            </label>
          )}

          <label>
            <span>
              <input
                name="rememberMe"
                type="checkbox"
                checked={rememberMe}
                onChange={(event) =>
                  setRememberMe(
                    event.target.checked,
                  )
                }
              />{' '}
              Remember me
            </span>
          </label>

          {!signingUp && (
            <a
              className="login-forgot"
              href="/forgot-password"
            >
              Forgot password?
            </a>
          )}

          {error && (
            <p
              className="login-error"
              role="alert"
            >
              {error}
            </p>
          )}

          <button
            className="login-submit"
            type="submit"
            disabled={submitting}
          >
            {submitting
              ? 'Please wait...'
              : signingUp
                ? 'Create account'
                : 'Sign in'}
          </button>

          <div className="login-switch">
            <span>
              {signingUp
                ? 'Already have an account?'
                : 'New to AllModelAI?'}
            </span>

            <button
              type="button"
              onClick={() =>
                changeMode(
                  signingUp
                    ? 'signin'
                    : 'signup',
                )
              }
            >
              {signingUp
                ? 'Sign in'
                : 'Sign up'}
            </button>
          </div>
        </form>

        <p className="social-title">
          Or continue with
        </p>

        <div className="login-socials">
          {[
            'Google',
            'Apple',
            'Facebook',
          ].map((provider) => (
            <button
              type="button"
              key={provider}
              disabled={submitting}
              onClick={() =>
                handleSocialSignIn(provider)
              }
            >
              <img
                src={
                  provider === 'Google'
                    ? 'https://cdn.simpleicons.org/google'
                    : provider === 'Apple'
                      ? 'https://cdn.simpleicons.org/apple/ffffff'
                      : 'https://cdn.simpleicons.org/facebook/1877F2'
                }
                alt=""
              />

              {provider}
            </button>
          ))}
        </div>
      </section>

      {activeSocialProvider && (
        <SocialAuthModal
          provider={activeSocialProvider}
          rememberMe={rememberMe}
          onClose={() =>
            setActiveSocialProvider(null)
          }
          onSuccess={handleSocialSuccess}
        />
      )}
    </div>
  );

  return createPortal(modalTree, document.body);
}