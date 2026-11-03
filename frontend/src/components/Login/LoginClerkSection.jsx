import { ClerkProvider, SignIn, SignUp, useAuth, useClerk } from '@clerk/react';
import { useEffect, useRef, useState } from 'react';
import { clerkAuthAppearance, clerkAuthLocalization, clerkPublishableKey } from '../../lib/clerkAuthConfig.js';
import { CLERK_PASSWORD_HINT } from '../../lib/clerkPasswordPolicy.js';
import {
  exchangeClerkSessionForAllModelAI,
  isPermanentClerkExchangeFailure,
} from '../../lib/clerkSessionExchange.js';
import './LoginClerkSection.css';

function ClerkAutoExchange({
  signingUp,
  rememberMe,
  disabled,
  resumeLink,
  onBusyChange,
  onError,
  onSuccess,
  onLinkRequired,
}) {
  const { getToken, isSignedIn, isLoaded } = useAuth();
  const { signOut } = useClerk();
  const exchangeStarted = useRef(false);
  const permanentFailure = useRef(false);
  const resumeSeen = useRef(false);
  const [exchangeError, setExchangeError] = useState('');
  const [linkOffer, setLinkOffer] = useState(false);

  useEffect(() => {
    if (resumeLink && !resumeSeen.current) {
      resumeSeen.current = true;
      exchangeStarted.current = false;
      permanentFailure.current = false;
    }
    if (!isLoaded || !isSignedIn || disabled || exchangeStarted.current || permanentFailure.current) {
      return;
    }
    exchangeStarted.current = true;
    onBusyChange?.(true);
    onError?.('');
    setExchangeError('');
    (async () => {
      try {
        const outcome = await exchangeClerkSessionForAllModelAI(getToken, { rememberMe });
        await onSuccess?.(outcome);
      } catch (error) {
        const message = error?.message || 'Clerk sign-in could not be completed.';
        if (error?.code === 'CLERK_LINK_REQUIRED') {
          permanentFailure.current = true;
          setLinkOffer(true);
          setExchangeError('');
          onLinkRequired?.();
        } else if (isPermanentClerkExchangeFailure(error)) {
          permanentFailure.current = true;
          setExchangeError(message);
        } else {
          exchangeStarted.current = false;
          onError?.(message);
        }
      } finally {
        onBusyChange?.(false);
      }
    })();
  }, [
    disabled,
    getToken,
    isLoaded,
    isSignedIn,
    onBusyChange,
    onError,
    onLinkRequired,
    onSuccess,
    rememberMe,
    resumeLink,
  ]);

  if (!isLoaded) {
    return <p className="login-clerk-status" role="status">Loading secure sign-in…</p>;
  }

  if (linkOffer && !resumeLink) {
    return (
      <div className="login-clerk-recovery" role="status">
        <p>This email already belongs to an AllModelAI account. Sign in with that email or Google. Clerk is linked only after that sign-in, not from the email match alone.</p>
        <button
          type="button"
          className="login-clerk-recovery-btn"
          onClick={() => onLinkRequired?.()}
        >
          Continue with email or Google
        </button>
      </div>
    );
  }

  if (exchangeError) {
    return (
      <div className="login-clerk-recovery" role="alert">
        <p>{exchangeError}</p>
        <button
          type="button"
          className="login-clerk-recovery-btn"
          onClick={() => {
            void signOut().catch(() => {});
            onLinkRequired?.();
          }}
        >
          Use email or Google instead
        </button>
      </div>
    );
  }

  if (isSignedIn || resumeLink) {
    return (
      <p className="login-clerk-status" role="status">
        {resumeLink ? 'Linking Clerk to your signed-in account…' : 'Connecting AllModelAI session…'}
      </p>
    );
  }

  const appearance = clerkAuthAppearance();
  return (
    <>
      {signingUp ? (
        <p className="login-clerk-password-hint" id="login-clerk-password-hint">
          {CLERK_PASSWORD_HINT}
        </p>
      ) : null}
      {signingUp ? (
        <SignUp routing="hash" appearance={appearance} />
      ) : (
        <SignIn routing="hash" appearance={appearance} />
      )}
    </>
  );
}

export default function LoginClerkSection({
  signingUp,
  rememberMe,
  disabled,
  resumeLink = false,
  hidden = false,
  onBusyChange,
  onError,
  onSuccess,
  onLinkRequired,
}) {
  const publishableKey = clerkPublishableKey();
  return (
    <ClerkProvider publishableKey={publishableKey} localization={clerkAuthLocalization()}>
      <div className="login-clerk" hidden={hidden || undefined} aria-busy={disabled || undefined}>
        <ClerkAutoExchange
          signingUp={signingUp}
          rememberMe={rememberMe}
          disabled={disabled}
          resumeLink={resumeLink}
          onBusyChange={onBusyChange}
          onError={onError}
          onSuccess={onSuccess}
          onLinkRequired={onLinkRequired}
        />
      </div>
    </ClerkProvider>
  );
}
