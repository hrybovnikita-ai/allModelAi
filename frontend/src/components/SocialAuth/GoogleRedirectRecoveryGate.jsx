import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  awaitGoogleRedirectRecovery,
  clearSocialRedirectIntent,
  isGoogleRedirectRecoveryPending,
  navigateAfterSocialLogin,
  reconcileStaleRedirectIntent,
  shouldShowGoogleRedirectRecoveryUI,
} from '../../lib/socialSignIn';
import { authRecoveryLog } from '../../lib/socialAuthDiagnostics';
import { socialError } from '../../lib/socialSession';
import { AUTH_REDIRECT_RECOVERY_TIMEOUT_MS } from '../../lib/authSessionStatus';
import { consumeStoredSocialAuthError } from './SocialAuthCallback.jsx';
import { useSession } from '../Session/SessionProvider';
import './SocialAuth.css';

const SOCIAL_ERROR_KEY = 'allmodelai_social_error';

function readInitialRecoveringState() {
  reconcileStaleRedirectIntent();
  return shouldShowGoogleRedirectRecoveryUI();
}

/**
 * Single redirect recovery owner for normal SPA routes (/, /login, etc.).
 * Does not call getRedirectResult unless a Google redirect is pending.
 */
export default function GoogleRedirectRecoveryGate() {
  const navigate = useNavigate();
  const { refresh } = useSession();
  const startedRef = useRef(false);
  const [recovering, setRecovering] = useState(readInitialRecoveringState);
  const [failureMessage, setFailureMessage] = useState('');

  useEffect(() => {
    reconcileStaleRedirectIntent();
    if (!shouldShowGoogleRedirectRecoveryUI()) {
      setRecovering(false);
      return undefined;
    }
    if (startedRef.current) return undefined;
    startedRef.current = true;
    setRecovering(true);
    setFailureMessage('');

    let active = true;
    const safetyTimer = setTimeout(() => {
      if (!active) return;
      authRecoveryLog('Recovery overlay safety timeout — dismissing UI');
      clearSocialRedirectIntent();
      setRecovering(false);
      const timeoutMessage = 'Google sign-in took too long on this device. Please try again.';
      setFailureMessage(timeoutMessage);
      try {
        sessionStorage.setItem(SOCIAL_ERROR_KEY, timeoutMessage);
      } catch {
        /* ignore */
      }
    }, AUTH_REDIRECT_RECOVERY_TIMEOUT_MS);

    (async () => {
      try {
        const user = await awaitGoogleRedirectRecovery('GoogleRedirectRecoveryGate');
        if (!active) return;
        clearTimeout(safetyTimer);
        if (!user?.email) {
          const stored = consumeStoredSocialAuthError();
          setFailureMessage(stored || 'Google sign-in could not be completed. Please try again.');
          setRecovering(false);
          return;
        }
        await navigateAfterSocialLogin(user, { navigate, replaceDashboard: true });
        await refresh({ force: true });
        if (active) {
          setRecovering(false);
        }
      } catch (error) {
        if (!active) return;
        clearTimeout(safetyTimer);
        clearSocialRedirectIntent();
        const message = socialError(error);
        setFailureMessage(message);
        setRecovering(false);
        try {
          sessionStorage.setItem(SOCIAL_ERROR_KEY, message);
        } catch {
          /* ignore */
        }
      }
    })();

    return () => {
      active = false;
      clearTimeout(safetyTimer);
    };
  }, [navigate, refresh]);

  if (!recovering && !failureMessage) {
    return null;
  }

  if (!recovering && failureMessage) {
    return (
      <div className="social-auth-page social-auth-recovery-overlay" role="alert">
        <section className="social-auth-card">
          <p className="social-auth-eyebrow">Google sign-in</p>
          <h1>Sign-in incomplete</h1>
          <p className="social-auth-error">{failureMessage}</p>
          <div className="social-auth-actions">
            <button type="button" onClick={() => navigate('/login')}>Back to sign in</button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="social-auth-page social-auth-recovery-overlay" role="status" aria-live="polite">
      <section className="social-auth-card">
        <p className="social-auth-eyebrow">Google sign-in</p>
        <h1>Finishing sign-in</h1>
        <p className="social-auth-status social-auth-loading">
          <span className="social-auth-spinner" aria-hidden="true" />
          Completing your session…
        </p>
        {isGoogleRedirectRecoveryPending() ? null : (
          <p className="social-auth-status">Waiting for authentication to finish…</p>
        )}
      </section>
    </div>
  );
}

export { consumeStoredSocialAuthError };
