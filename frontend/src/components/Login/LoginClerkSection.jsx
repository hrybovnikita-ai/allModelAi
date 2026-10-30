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
  onBusyChange,
  onError,
  onSuccess,
  onUseExistingAccount,
}) {
  const { getToken, isSignedIn, isLoaded } = useAuth();
  const { signOut } = useClerk();
  const exchangeStarted = useRef(false);
  const permanentFailure = useRef(false);
  const [exchangeError, setExchangeError] = useState('');

  useEffect(() => {
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
        if (isPermanentClerkExchangeFailure(error)) {
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
    onSuccess,
    rememberMe,
  ]);

  if (!isLoaded) {
    return <p className="login-clerk-status" role="status">Loading secure sign-in…</p>;
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
            onUseExistingAccount?.();
          }}
        >
          Sign in with email or Google, then connect Clerk in Settings
        </button>
      </div>
    );
  }

  if (isSignedIn) {
    return (
      <p className="login-clerk-status" role="status">
        Connecting AllModelAI session…
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
  onBusyChange,
  onError,
  onSuccess,
  onUseExistingAccount,
}) {
  const publishableKey = clerkPublishableKey();
  return (
    <ClerkProvider publishableKey={publishableKey} localization={clerkAuthLocalization()}>
      <div className="login-clerk" aria-busy={disabled || undefined}>
        <ClerkAutoExchange
          signingUp={signingUp}
          rememberMe={rememberMe}
          disabled={disabled}
          onBusyChange={onBusyChange}
          onError={onError}
          onSuccess={onSuccess}
          onUseExistingAccount={onUseExistingAccount}
        />
      </div>
    </ClerkProvider>
  );
}
