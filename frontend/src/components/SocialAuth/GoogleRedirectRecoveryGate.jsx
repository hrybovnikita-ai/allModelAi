import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  awaitGoogleRedirectRecovery,
  isGoogleRedirectRecoveryPending,
  navigateAfterSocialLogin,
  peekRedirectIntent,
} from '../../lib/socialSignIn';
import { socialError } from '../../lib/socialSession';
import { consumeStoredSocialAuthError } from './SocialAuthCallback.jsx';
import './SocialAuth.css';

const SOCIAL_ERROR_KEY = 'allmodelai_social_error';

/**
 * Single redirect recovery owner for normal SPA routes (/, /login, etc.).
 * Does not call getRedirectResult unless a Google redirect is pending.
 */
export default function GoogleRedirectRecoveryGate() {
  const navigate = useNavigate();
  const startedRef = useRef(false);
  const [recovering, setRecovering] = useState(() => isGoogleRedirectRecoveryPending());

  useEffect(() => {
    if (startedRef.current) return;
    const intent = peekRedirectIntent();
    if (!intent || intent.phase !== 'awaiting-google-return') {
      return undefined;
    }
    startedRef.current = true;
    setRecovering(true);

    let active = true;
    (async () => {
      try {
        const user = await awaitGoogleRedirectRecovery('GoogleRedirectRecoveryGate');
        if (!active) return;
        if (!user) {
          setRecovering(false);
          return;
        }
        navigateAfterSocialLogin(user, { navigate, replaceDashboard: true });
      } catch (error) {
        if (!active) return;
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
