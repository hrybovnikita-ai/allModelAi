import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { awaitGoogleRedirectRecovery, navigateAfterSocialLogin, peekRedirectIntent } from '../../lib/socialSignIn';
import { socialError } from '../../lib/socialSession';
import { AllModelAILogoMark } from '../AllModelAILogo/AllModelAILogo';
import './SocialAuth.css';

export function consumeStoredSocialAuthError() {
  try {
    const message = sessionStorage.getItem('allmodelai_social_error');
    if (message) {
      sessionStorage.removeItem('allmodelai_social_error');
      return message;
    }
  } catch {
    /* ignore */
  }
  return '';
}

/** UI shell only — redirect recovery runs in App bootstrap / shared pipeline. */
export default function SocialAuthCallback() {
  const navigate = useNavigate();
  const [message, setMessage] = useState('Finishing sign-in…');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (!peekRedirectIntent()) {
          if (!active) return;
          setError('No pending Google sign-in was found. Try again from the login page.');
          return;
        }
        setMessage('Authenticating with your provider…');
        const user = await awaitGoogleRedirectRecovery('SocialAuthCallback');
        if (!active) return;
        if (!user) {
          setError('Google sign-in could not be completed. Try again from the login page.');
          return;
        }
        setMessage('Signing you in…');
        navigateAfterSocialLogin(user, { navigate, replaceDashboard: true });
      } catch (err) {
        if (!active) return;
        setError(socialError(err));
      }
    })();

    return () => {
      active = false;
    };
  }, [navigate]);

  return (
    <main className="social-auth-page">
      <section className="social-auth-card" aria-live="polite">
        <Link className="social-auth-brand" to="/">
          <AllModelAILogoMark size={28} />
          AllModelAI
        </Link>
        <p className="social-auth-eyebrow">Secure sign-in</p>
        <h1>{error ? 'Sign-in incomplete' : 'Almost there'}</h1>
        {!error && (
          <p className="social-auth-status social-auth-loading">
            <span className="social-auth-spinner" aria-hidden="true" />
            {message}
          </p>
        )}
        {error && (
          <>
            <p className="social-auth-error" role="alert">{error}</p>
            <div className="social-auth-actions">
              <Link to="/login">Back to sign in</Link>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
