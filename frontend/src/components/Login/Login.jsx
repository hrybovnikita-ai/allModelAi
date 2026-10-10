import { applyAuthResponsePayload, confirmSession } from '../../lib/session';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { AllModelAILogoMark } from '../AllModelAILogo/AllModelAILogo';
import { authPost } from '../../lib/authApi';
import { validateRegistrationForm } from '../../lib/authValidation';
import { ensureSocialAuthReady, getMissingFirebaseConfigKeys, isFirebaseSocialConfigured } from '../../lib/firebase';
import { ensureFirebaseSocialConfigLoaded } from '../../lib/loadFirebaseConfig';
import { consumeStoredSocialAuthError } from '../SocialAuth/GoogleRedirectRecoveryGate';
import {
  completeGooglePopupSignIn,
  isGoogleRedirectRecoveryPending,
  launchGooglePopupSignIn,
  navigateAfterSocialLogin,
  startGoogleRedirectSignIn,
} from '../../lib/socialSignIn';
import { shouldPreferGoogleRedirectSignIn } from '../../lib/socialSignInEnv';
import { canUseGoogleRedirectSignIn } from '../../lib/storageAvailability';
import { markFreshLogin } from '../../lib/session';
import { useSession } from '../Session/SessionProvider';
import { isRetryableSocialSignInError, socialError } from '../../lib/socialSession';
import AuthDebugPanel from '../SocialAuth/AuthDebugPanel';
import GoogleSignInIcon from './GoogleSignInIcon';
import './Login.css';

export default function Login(props) {
  const { ref: _ignoredRef, ...rest } = props;
  return <LoginForm {...rest} />;
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
  const { refresh } = useSession();

  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [socialBusy, setSocialBusy] = useState(null);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false);
  const [successNotice, setSuccessNotice] = useState('');
  const [needsPasswordSetup, setNeedsPasswordSetup] = useState(false);
  const [firebaseSocialReady, setFirebaseSocialReady] = useState(() => isFirebaseSocialConfigured());
  const [firebaseConfigChecked, setFirebaseConfigChecked] = useState(() => isFirebaseSocialConfigured());
  const [authReadyForGoogle, setAuthReadyForGoogle] = useState(false);
  const [socialErrorCode, setSocialErrorCode] = useState('');
  const googleSignInClickLock = useRef(false);

  useEffect(() => {
    if (isGoogleRedirectRecoveryPending()) {
      return;
    }
    const storedSocialError = consumeStoredSocialAuthError();
    if (storedSocialError) {
      setError(storedSocialError);
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      if (isFirebaseSocialConfigured()) {
        await ensureSocialAuthReady();
        if (active) {
          setFirebaseSocialReady(true);
          setFirebaseConfigChecked(true);
          setAuthReadyForGoogle(true);
        }
        return;
      }
      const ready = await ensureFirebaseSocialConfigLoaded();
      if (!active) return;
      setFirebaseSocialReady(ready);
      setFirebaseConfigChecked(true);
      if (ready) {
        await ensureSocialAuthReady();
        if (active) setAuthReadyForGoogle(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const handleSocialSignIn = (provider) => {
    if (googleSignInClickLock.current || submitting || socialBusy || !authReadyForGoogle || !firebaseSocialReady) {
      if (!firebaseSocialReady && firebaseConfigChecked) {
        setError(
          `Google sign-in is not configured. Set ${getMissingFirebaseConfigKeys().join(', ')} in frontend/.env or FIREBASE_WEB_* on the backend.`,
        );
      }
      return;
    }
    googleSignInClickLock.current = true;
    setError('');
    setSocialErrorCode('');
    setSocialBusy(provider);

    if (shouldPreferGoogleRedirectSignIn()) {
      if (!canUseGoogleRedirectSignIn()) {
        setSocialBusy(null);
        setError(
          socialError({ code: 'auth/web-storage-unsupported' }),
        );
        return;
      }
      void (async () => {
        try {
          await startGoogleRedirectSignIn(provider, { rememberMe }, 'ios-safari');
        } catch (requestError) {
          setSocialErrorCode(requestError?.code || '');
          setError(socialError(requestError));
          setSocialBusy(null);
          googleSignInClickLock.current = false;
        }
      })();
      return;
    }

    let launched;
    try {
      launched = launchGooglePopupSignIn();
    } catch (launchError) {
      setSocialBusy(null);
      googleSignInClickLock.current = false;
      setSocialErrorCode(launchError?.code || '');
      setError(socialError(launchError));
      return;
    }
    const { auth, popupPromise } = launched;
    void (async () => {
      try {
        const outcome = await completeGooglePopupSignIn(auth, popupPromise, provider, { rememberMe });
        if (outcome?.redirected) {
          return;
        }
        document.activeElement?.blur();
        await refresh({ force: true });
        await navigateAfterSocialLogin(outcome, { navigate, replaceDashboard: true });
      } catch (requestError) {
        setSocialErrorCode(requestError?.code || '');
        if (requestError.code === 'SESSION_NOT_CONFIRMED') {
          setError('Sign-in reached Google but your AllModelAI session could not be verified. Please try again.');
        } else {
          setError(socialError(requestError));
        }
      } finally {
        setSocialBusy(null);
        googleSignInClickLock.current = false;
      }
    })();
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccessNotice('');
    setNeedsPasswordSetup(false);

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
      markFreshLogin();

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
        setNeedsPasswordSetup(true);
        setError(
          requestError.message ||
            'No password is set for this email. Sign in with Google, then set a password under Settings → Security.',
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
      } else if (requestError.status === 401 && !signingUp && requestError.code !== 'PASSWORD_SETUP_REQUIRED') {
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

  const socialDisabled = submitting || Boolean(socialBusy) || !authReadyForGoogle;

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
            <div className="login-error-block" role="alert">
              <p className="login-error">{error}</p>
              {isRetryableSocialSignInError(socialErrorCode) && (
                <button
                  type="button"
                  className="login-retry-btn"
                  disabled={socialDisabled || !firebaseSocialReady}
                  onClick={() => handleSocialSignIn('Google')}
                >
                  Retry Google sign-in
                </button>
              )}
            </div>
          )}

          {needsPasswordSetup && !signingUp && (
            <p className="login-password-setup-hint" role="status">
              Use <strong>Continue with Google</strong> above, then open{' '}
              <Link to="/settings#settings-security" onClick={onClose}>
                Settings → Security
              </Link>{' '}
              to set an AllModelAI password for this email.
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

        <div className="login-socials login-socials--single" role="group" aria-label="Social sign-in">
          {firebaseConfigChecked && !firebaseSocialReady && (
            <p className="login-social-config-hint" role="status">
              {import.meta.env.DEV
                ? `Google sign-in is not configured. Set ${getMissingFirebaseConfigKeys().join(', ')} in frontend/.env or FIREBASE_WEB_* on the backend, then restart dev servers.`
                : 'Google sign-in is unavailable. Use email and password, or try again later.'}
            </p>
          )}
          <button
            type="button"
            className="login-social-btn login-social-btn--google"
            disabled={socialDisabled || !firebaseSocialReady}
            aria-busy={socialBusy === 'Google'}
            title={!firebaseSocialReady ? 'Firebase web configuration is missing' : undefined}
            onClick={() => handleSocialSignIn('Google')}
          >
            <GoogleSignInIcon className="login-social-google-icon" />
            <span>
              {socialBusy === 'Google' ? 'Connecting to Google…' : 'Continue with Google'}
            </span>
            {socialBusy === 'Google' && <span className="login-social-spinner" aria-hidden="true" />}
          </button>
        </div>

        <AuthDebugPanel />
      </section>
    </div>
  );

  return createPortal(modalTree, document.body);
}
