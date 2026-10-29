import {
  applyAuthResponsePayload,
  clearNativeSessionToken,
  confirmSession,
  rememberSession,
} from '../../lib/session';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { AllModelAILogoMark } from '../AllModelAILogo/AllModelAILogo';
import { authPost } from '../../lib/authApi';
import { signInWithEmailPasswordAllModelAI } from '../../lib/emailPasswordSignIn';
import { syncFirebaseEmailAccountAfterRegister } from '../../lib/firebaseEmailAccount';
import { validateRegistrationForm } from '../../lib/authValidation';
import { ensureSocialAuthReady, getMissingFirebaseConfigKeys, isFirebaseSocialConfigured } from '../../lib/firebase';
import { ensureFirebaseSocialConfigLoaded } from '../../lib/loadFirebaseConfig';
import { consumeStoredSocialAuthError } from '../../lib/socialAuthDiagnostics';
import {
  completeGooglePopupSignIn,
  isGoogleRedirectRecoveryPending,
  launchGooglePopupSignIn,
  navigateAfterSocialLogin,
  shouldUseRedirectSignInFirst,
  startGoogleRedirectSignIn,
} from '../../lib/socialSignIn';
import { canUseGoogleRedirectSignIn } from '../../lib/storageAvailability';
import { markFreshLogin } from '../../lib/session';
import { useSession } from '../Session/SessionProvider';
import { isBenignGoogleSignInCancellation, isRetryableSocialSignInError, socialError } from '../../lib/socialSession';
import AuthDebugPanel from '../SocialAuth/AuthDebugPanel';
import GoogleSignInIcon from './GoogleSignInIcon';
import {
  fetchClerkAuthBackendEnabled,
  isClerkMainAuthClientReady,
} from '../../lib/clerkAuthConfig';
import './Login.css';

const LoginClerkSection = lazy(() => import('./LoginClerkSection.jsx'));

export default function Login(props) {
  const rest = { ...props };
  delete rest.ref;
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
  const [successNotice, setSuccessNotice] = useState('');
  const [firebaseSocialReady, setFirebaseSocialReady] = useState(() => isFirebaseSocialConfigured());
  const [firebaseConfigChecked, setFirebaseConfigChecked] = useState(() => isFirebaseSocialConfigured());
  const [authReadyForGoogle, setAuthReadyForGoogle] = useState(false);
  const [socialErrorCode, setSocialErrorCode] = useState('');
  const [lastSocialProvider, setLastSocialProvider] = useState('Google');
  const googleSignInClickLock = useRef(false);
  const emailSubmitLock = useRef(false);
  const [passwordSetupHint, setPasswordSetupHint] = useState(false);
  const [clerkUiEnabled, setClerkUiEnabled] = useState(false);
  const [clerkBusy, setClerkBusy] = useState(false);
  /** 'account' = Firebase email/Google; 'clerk' = Clerk-only panel (avoids stacked duplicate Google UI). */
  const [authMethod, setAuthMethod] = useState('account');

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
    if (!isClerkMainAuthClientReady()) {
      setClerkUiEnabled(false);
      return;
    }
    let active = true;
    fetchClerkAuthBackendEnabled().then((enabled) => {
      if (active) setClerkUiEnabled(enabled);
    });
    return () => {
      active = false;
    };
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
    setLastSocialProvider(provider);

    if (shouldUseRedirectSignInFirst()) {
      if (!canUseGoogleRedirectSignIn()) {
        setSocialBusy(null);
        googleSignInClickLock.current = false;
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
      launched = launchGooglePopupSignIn(provider);
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
        markFreshLogin();
        await refresh({ force: true, silent: true });
        await navigateAfterSocialLogin(outcome, { navigate, replaceDashboard: true });
        onClose?.();
      } catch (requestError) {
        if (isBenignGoogleSignInCancellation(requestError)) {
          setError('');
          setSocialErrorCode('');
          return;
        }
        if (requestError?.code === 'auth/popup-timeout') {
          setError(socialError(requestError));
          return;
        }
        setSocialErrorCode(requestError?.code || '');
        if (requestError.code === 'SESSION_NOT_CONFIRMED') {
          setError('Your AllModelAI session could not be verified. Please try again.');
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
    if (emailSubmitLock.current || submitting || socialBusy) {
      return;
    }
    setError('');
    setSuccessNotice('');
    setPasswordSetupHint(false);
    setSubmitting(true);

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
        setSubmitting(false);
        return;
      }
      payload = { ...validation.payload, rememberMe };
    } else {
      if (!String(raw.email || '').trim()) {
        setError('Please enter your email address.');
        setSubmitting(false);
        return;
      }
      if (!raw.password) {
        setError('Please enter a password.');
        setSubmitting(false);
        return;
      }
      payload = {
        email: String(raw.email).trim().toLowerCase(),
        password: raw.password,
        rememberMe,
      };
    }

    emailSubmitLock.current = true;
    try {
      let data;
      let sessionUser;

      if (signingUp) {
        ({ data } = await authPost('register', payload));
        await syncFirebaseEmailAccountAfterRegister(payload.email, payload.password);
      } else {
        const outcome = await signInWithEmailPasswordAllModelAI({
          email: payload.email,
          password: payload.password,
          rememberMe: payload.rememberMe,
        });
        if (outcome.channel === 'firebase') {
          sessionUser = outcome.user;
          data = outcome.data;
        } else {
          data = outcome.data;
        }
      }

      if (signingUp && data?.needsEmailVerification) {
        setSuccessNotice(
          data.message ||
            'Account created. Check your email to verify ownership, then sign in.',
        );
        onModeChange?.('signin');
        return;
      }

      if (!sessionUser) {
        applyAuthResponsePayload(data);
        rememberSession(data.user, { serverVerified: false });
        sessionUser = await confirmSession(data.user);
      } else {
        rememberSession(sessionUser, { serverVerified: true });
      }
      await finishAuthNavigation(sessionUser, data);
    } catch (requestError) {
      if (requestError.status === 401) {
        clearNativeSessionToken();
      }
      if (requestError.code === 'EMAIL_NOT_VERIFIED') {
        setError(
          requestError.message ||
            'Verify your email before signing in. Check your inbox for the verification link.',
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
        setError('Could not complete sign-in. Please try again.');
      } else if (
        !signingUp
        && (
          requestError.code === 'PASSWORD_SETUP_REQUIRED'
          || requestError.data?.debugReason === 'PASSWORD_HASH_MISSING'
          || requestError.data?.debugReason === 'PASSWORD_HASH_INVALID'
        )
      ) {
        const fromServer = requestError.message
          && !/incorrect email or password/i.test(requestError.message)
          ? requestError.message
          : '';
        setPasswordSetupHint(true);
        setError(fromServer);
      } else if (
        !signingUp
        && (requestError.status === 401 || requestError.code === 'INVALID_CREDENTIALS')
      ) {
        setError('Unable to sign in. Check your details or reset your password.');
      } else if (
        requestError.code === 'DATABASE_UNAVAILABLE'
        || requestError.status >= 500
      ) {
        setError('Sign-in is temporarily unavailable. Please try again.');
      } else if (
        requestError.code === 'API_PROXY_UPSTREAM_DOWN'
        || requestError.message?.includes('Local API unreachable')
        || requestError.message?.includes('Failed to fetch')
        || requestError.code === 'AUTH_NETWORK_ERROR'
        || requestError.code === 'BACKEND_UNREACHABLE'
      ) {
        setError('Connection problem. Please try again.');
      } else {
        setError(
          signingUp
            ? 'Could not create your account. Please try again.'
            : 'Could not complete sign-in. Please try again.',
        );
      }
    } finally {
      emailSubmitLock.current = false;
      setSubmitting(false);
    }
  };

  const changeMode = (nextMode) => {
    setError('');
    setPasswordSetupHint(false);
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

  const finishAuthNavigation = async (sessionUser, data = {}) => {
    markFreshLogin();
    await refresh({ force: true });
    document.activeElement?.blur();
    onClose?.();
    const destination = signingUp ? '/dashboard' : returnTo;
    setSuccessNotice(signingUp ? 'Welcome to AllModelAI!' : 'Welcome back!');
    navigate(destination, {
      replace: true,
      state: {
        ...returnState,
        user: sessionUser,
        welcomeEmail: data.welcomeEmail,
      },
    });
  };

  const handleClerkSuccess = async ({ user: sessionUser }) => {
    await finishAuthNavigation(sessionUser);
  };

  const socialDisabled = submitting || Boolean(socialBusy) || clerkBusy || !authReadyForGoogle;
  const showClerkPanel = clerkUiEnabled && authMethod === 'clerk';
  const showAccountPanel = !clerkUiEnabled || authMethod === 'account';

  const selectAuthMethod = (method) => {
    if (method === authMethod) return;
    setError('');
    setSuccessNotice('');
    setClerkBusy(false);
    setAuthMethod(method);
  };

  const modalTree = (
    <div className="login-overlay" role="presentation">
      <div
        className="login-backdrop-layer"
        aria-hidden="true"
        onMouseDown={onClose}
      />
      <section
        className={`login-modal${clerkUiEnabled ? ' login-modal--with-clerk' : ''}`}
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

        {clerkUiEnabled ? (
          <div className="login-auth-methods" role="tablist" aria-label="Authentication method">
            <button
              type="button"
              role="tab"
              id="login-method-account"
              aria-selected={authMethod === 'account'}
              aria-controls="login-method-panel"
              className={authMethod === 'account' ? 'is-active' : undefined}
              disabled={clerkBusy || submitting || Boolean(socialBusy)}
              onClick={() => selectAuthMethod('account')}
            >
              Email & Google
            </button>
            <button
              type="button"
              role="tab"
              id="login-method-clerk"
              aria-selected={authMethod === 'clerk'}
              aria-controls="login-method-panel"
              className={authMethod === 'clerk' ? 'is-active' : undefined}
              disabled={clerkBusy || submitting || Boolean(socialBusy)}
              onClick={() => selectAuthMethod('clerk')}
            >
              Clerk
            </button>
          </div>
        ) : null}

        <div
          id="login-method-panel"
          role="tabpanel"
          aria-labelledby={showClerkPanel ? 'login-method-clerk' : 'login-method-account'}
          className="login-method-panel"
        >
        {showAccountPanel ? (
          <>
        <form className="login-form" onSubmit={handleSubmit} noValidate>
          {signingUp && (
            <label>
              <span>Full name</span>
              <input
                name="name"
                type="text"
                placeholder="Your full name"
                autoComplete="name"
                required
                aria-required="true"
              />
            </label>
          )}

          <label>
            <span>{signingUp ? 'Email address' : 'Email'}</span>
            <input
              name="email"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              required
              inputMode="email"
              aria-required="true"
            />
          </label>

          <label>
            <span>Password</span>
            <span className="password-field">
              <input
                name="password"
                type={passwordVisible ? 'text' : 'password'}
                placeholder={signingUp ? 'At least 8 characters' : 'Your password'}
                autoComplete={signingUp ? 'new-password' : 'current-password'}
                required
                minLength={signingUp ? 8 : undefined}
                aria-required="true"
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setPasswordVisible((visible) => !visible)}
                aria-label={passwordVisible ? 'Hide password' : 'Show password'}
                aria-pressed={passwordVisible}
              >
                <span className="password-toggle-icon" aria-hidden="true">
                  {passwordVisible ? (
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 5.1A9.8 9.8 0 0121 12c-.6 1.1-1.4 2.1-2.4 2.9M6.1 6.1C4.6 7.4 3.5 9.1 3 12c1.5 4.5 5.4 7 9 7 1.4 0 2.8-.3 4.1-.9" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" strokeLinecap="round" strokeLinejoin="round" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </span>
              </button>
            </span>
          </label>

          {signingUp && (
            <label>
              <span>Confirm password</span>
              <span className="password-field">
                <input
                  name="confirmPassword"
                  type={passwordVisible ? 'text' : 'password'}
                  placeholder="Re-enter your password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  aria-required="true"
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setPasswordVisible((visible) => !visible)}
                  aria-label={passwordVisible ? 'Hide password' : 'Show password'}
                  aria-pressed={passwordVisible}
                >
                  <span className="password-toggle-icon" aria-hidden="true">
                    {passwordVisible ? (
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 5.1A9.8 9.8 0 0121 12c-.6 1.1-1.4 2.1-2.4 2.9M6.1 6.1C4.6 7.4 3.5 9.1 3 12c1.5 4.5 5.4 7 9 7 1.4 0 2.8-.3 4.1-.9" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" strokeLinecap="round" strokeLinejoin="round" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </span>
                </button>
              </span>
            </label>
          )}

          <div className="login-form-meta">
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
              <Link className="login-forgot" to="/forgot-password" onClick={onClose}>
                Forgot password?
              </Link>
            )}
          </div>

          {successNotice && (
            <p className="login-success" role="status">
              {successNotice}
            </p>
          )}

          {passwordSetupHint && !signingUp ? (
            <p className="login-hint">
              This account uses Google and has no password yet.
              {' '}
              <button
                type="button"
                className="login-inline-action"
                disabled={socialDisabled}
                onClick={() => handleSocialSignIn('Google')}
              >
                Continue with Google
              </button>
              , then set a password in Settings, or use Forgot password to create one for this same account.
            </p>
          ) : null}

          {error && (
            <div className="login-error-block" role="alert">
              <p className="login-error">{error}</p>
              {isRetryableSocialSignInError(socialErrorCode) && (
                <button
                  type="button"
                  className="login-retry-btn"
                  disabled={socialDisabled || !firebaseSocialReady}
                  onClick={() => handleSocialSignIn(lastSocialProvider)}
                >
                  Retry {lastSocialProvider} sign-in
                </button>
              )}
            </div>
          )}

          <button
            className="login-submit"
            type="submit"
            disabled={submitting || Boolean(socialBusy) || clerkBusy}
            aria-busy={submitting}
          >
            {submitting
              ? signingUp
                ? 'Creating account…'
                : 'Signing in…'
              : signingUp
                ? 'Create account'
                : 'Sign in'}
            {submitting && <span className="login-social-spinner login-submit-spinner" aria-hidden="true" />}
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
          </>
        ) : null}

        {showClerkPanel ? (
          <div className="login-clerk-panel">
            <p className="login-clerk-intro">
              {signingUp
                ? 'Create an account with Clerk email/password or Google.'
                : 'Sign in with Clerk email/password or Google.'}
            </p>
            <label className="login-remember login-clerk-remember">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(event) => setRememberMe(event.target.checked)}
              />
              Remember me
            </label>
            {error ? (
              <div className="login-error-block" role="alert">
                <p className="login-error">{error}</p>
              </div>
            ) : null}
            <Suspense fallback={<p className="login-clerk-status">Loading secure sign-in…</p>}>
              <LoginClerkSection
                key={signingUp ? 'clerk-sign-up' : 'clerk-sign-in'}
                signingUp={signingUp}
                rememberMe={rememberMe}
                disabled={submitting || Boolean(socialBusy) || clerkBusy}
                onBusyChange={setClerkBusy}
                onError={setError}
                onSuccess={handleClerkSuccess}
              />
            </Suspense>
            <div className="login-switch">
              <span>
                {signingUp ? 'Already have an account?' : 'New to AllModelAI?'}
              </span>
              <button
                type="button"
                disabled={clerkBusy}
                onClick={() => changeMode(signingUp ? 'signin' : 'signup')}
              >
                {signingUp ? 'Sign in' : 'Sign up'}
              </button>
            </div>
          </div>
        ) : null}
        </div>

        <AuthDebugPanel />
      </section>
    </div>
  );

  return createPortal(modalTree, document.body);
}
