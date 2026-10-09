import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  awaitGoogleRedirectRecovery,
  clearSocialRedirectIntent,
  navigateAfterSocialLogin,
  reconcileStaleRedirectIntent,
  shouldShowGoogleRedirectRecoveryUI,
} from '../../lib/socialSignIn';
import { authRecoveryLog } from '../../lib/socialAuthDiagnostics';
import { socialError } from '../../lib/socialSession';
import { consumeStoredSocialAuthError } from './SocialAuthCallback.jsx';
import './SocialAuth.css';

const SOCIAL_ERROR_KEY = 'allmodelai_social_error';
/** Redirect result (~800ms) + auth-state fallback (~1s) + backend exchange buffer */
const RECOVERY_OVERLAY_SAFETY_MS = 15000;

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
  const startedRef = useRef(false);
  const [recovering, setRecovering] = useState(readInitialRecoveringState);

  useEffect(() => {
    reconcileStaleRedirectIntent();
    if (!shouldShowGoogleRedirectRecoveryUI()) {
      setRecovering(false);
      return undefined;
    }
    if (startedRef.current) return undefined;
    startedRef.current = true;
    setRecovering(true);

    let active = true;
    const safetyTimer = setTimeout(() => {
      if (!active) return;
      authRecoveryLog('Recovery overlay safety timeout — dismissing UI');
      clearSocialRedirectIntent();
      setRecovering(false);
      try {
        sessionStorage.setItem(
          SOCIAL_ERROR_KEY,
          'Google sign-in took too long on this device. Please try again.',
        );
      } catch {
        /* ignore */
      }
    }, RECOVERY_OVERLAY_SAFETY_MS);

    (async () => {
      try {
        const user = await awaitGoogleRedirectRecovery('GoogleRedirectRecoveryGate');
        if (!active) return;
        clearTimeout(safetyTimer);
        if (!user) {
          setRecovering(false);
          return;
        }
        await navigateAfterSocialLogin(user, { navigate, replaceDashboard: true });
      } catch (error) {
        if (!active) return;
        clearTimeout(safetyTimer);
        clearSocialRedirectIntent();
        setRecovering(false);
        try {
          sessionStorage.setItem(SOCIAL_ERROR_KEY, socialError(error));
        } catch {
          /* ignore */
        }
      }
    })();

    return () => {
      active = false;
      clearTimeout(safetyTimer);
    };
  }, [navigate]);

  if (!recovering) {
    return null;
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
      </section>
    </div>
  );
}

export { consumeStoredSocialAuthError };
