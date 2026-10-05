import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ensureFirebaseSocialConfigLoaded } from '../../lib/loadFirebaseConfig';
import { navigateAfterSocialLogin, resumePendingSocialRedirect } from '../../lib/socialSignIn';
import { socialError } from '../../lib/socialSession';

const SOCIAL_ERROR_KEY = 'allmodelai_social_error';

export function consumeStoredSocialAuthError() {
  try {
    const message = sessionStorage.getItem(SOCIAL_ERROR_KEY);
    if (message) {
      sessionStorage.removeItem(SOCIAL_ERROR_KEY);
      return message;
    }
  } catch {
    /* ignore */
  }
  return '';
}

export default function SocialAuthRedirectHandler() {
  const navigate = useNavigate();
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current) return;
    let active = true;

    (async () => {
      try {
        await ensureFirebaseSocialConfigLoaded();
        const user = await resumePendingSocialRedirect();
        if (!active || !user) return;
        handledRef.current = true;
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
