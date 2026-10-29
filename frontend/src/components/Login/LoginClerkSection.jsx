import { ClerkProvider, SignIn, SignUp, useAuth } from '@clerk/react';
import { useEffect, useRef } from 'react';
import { clerkAuthAppearance, clerkPublishableKey } from '../../lib/clerkAuthConfig.js';
import { exchangeClerkSessionForAllModelAI } from '../../lib/clerkSessionExchange.js';
import './LoginClerkSection.css';

function ClerkAutoExchange({
  signingUp,
  rememberMe,
  disabled,
  onBusyChange,
  onError,
  onSuccess,
}) {
  const { getToken, isSignedIn, isLoaded } = useAuth();
  const exchangeStarted = useRef(false);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || disabled || exchangeStarted.current) {
      return;
    }
    exchangeStarted.current = true;
    onBusyChange?.(true);
    onError?.('');
    (async () => {
      try {
        const outcome = await exchangeClerkSessionForAllModelAI(getToken, { rememberMe });
        await onSuccess?.(outcome);
      } catch (error) {
        exchangeStarted.current = false;
        onError?.(error?.message || 'Clerk sign-in could not be completed.');
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

  if (isSignedIn) {
    return (
      <p className="login-clerk-status" role="status">
        {disabled ? 'Connecting AllModelAI session…' : 'Finishing secure sign-in…'}
      </p>
    );
  }

  const appearance = clerkAuthAppearance();
  return signingUp ? (
    <SignUp routing="hash" appearance={appearance} />
  ) : (
    <SignIn routing="hash" appearance={appearance} />
  );
}

export default function LoginClerkSection({
  signingUp,
  rememberMe,
  disabled,
  onBusyChange,
  onError,
  onSuccess,
}) {
  const publishableKey = clerkPublishableKey();
  return (
    <ClerkProvider publishableKey={publishableKey}>
      <div className="login-clerk" aria-busy={disabled || undefined}>
        <ClerkAutoExchange
          signingUp={signingUp}
          rememberMe={rememberMe}
          disabled={disabled}
          onBusyChange={onBusyChange}
          onError={onError}
          onSuccess={onSuccess}
        />
      </div>
    </ClerkProvider>
  );
}
