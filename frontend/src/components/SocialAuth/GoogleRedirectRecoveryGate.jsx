import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  awaitGoogleRedirectRecovery,
  navigateAfterSocialLogin,
  peekRedirectIntent,
} from '../../lib/socialSignIn';
import { socialError } from '../../lib/socialSession';
import { consumeStoredSocialAuthError } from './SocialAuthCallback.jsx';

const SOCIAL_ERROR_KEY = 'allmodelai_social_error';

/**
 * Single redirect recovery owner for normal SPA routes (/, /login, etc.).
 * Does not call getRedirectResult unless a Google redirect is pending.
 */
export default function GoogleRedirectRecoveryGate() {
  const navigate = useNavigate();
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    const intent = peekRedirectIntent();
    if (!intent || intent.phase !== 'awaiting-google-return') {
      return undefined;
    }
    startedRef.current = true;

    let active = true;
    (async () => {
      try {
        const user = await awaitGoogleRedirectRecovery('GoogleRedirectRecoveryGate');
        if (!active || !user) return;
        navigateAfterSocialLogin(user, { navigate, replaceDashboard: true });
      } catch (error) {
        if (!active) return;
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

  return null;
}

export { consumeStoredSocialAuthError };
