import { ClerkProvider, SignIn, useAuth } from '@clerk/react';
import { useEffect, useRef, useState } from 'react';
import {
  clerkAuthAppearance,
  clerkAuthLocalization,
  clerkPublishableKey,
  fetchClerkAuthBackendEnabled,
  isClerkMainAuthClientReady,
} from '../../lib/clerkAuthConfig.js';
import { exchangeClerkSessionForAllModelAI } from '../../lib/clerkSessionExchange.js';

function ClerkLinkExchange({ onBusyChange, onError, onSuccess }) {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const started = useRef(false);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || started.current) return;
    started.current = true;
    onBusyChange?.(true);
    onError?.('');
    (async () => {
      try {
        const outcome = await exchangeClerkSessionForAllModelAI(getToken, { rememberMe: true });
        onSuccess?.(outcome);
      } catch (error) {
        started.current = false;
        onError?.(error?.message || 'Could not connect Clerk to this account.');
      } finally {
        onBusyChange?.(false);
      }
    })();
  }, [getToken, isLoaded, isSignedIn, onBusyChange, onError, onSuccess]);

  if (!isLoaded) {
    return <p className="settings-security-hint" role="status">Loading Clerk…</p>;
  }
  if (isSignedIn) {
    return <p className="settings-security-hint" role="status">Connecting Clerk to this AllModelAI account…</p>;
  }
  return (
    <SignIn
      routing="hash"
      appearance={clerkAuthAppearance()}
    />
  );
}

export default function ClerkConnect({ connected, onLinked }) {
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const alreadyLinked = connected.includes('clerk');

  useEffect(() => {
    if (!isClerkMainAuthClientReady()) {
      setEnabled(false);
      return;
    }
    let active = true;
    fetchClerkAuthBackendEnabled().then((value) => {
      if (active) setEnabled(value);
    });
    return () => {
      active = false;
    };
  }, []);

  if (!enabled) return null;

  return (
    <div className="settings-clerk-connect">
      <button
        type="button"
        disabled={busy || alreadyLinked}
        onClick={() => {
          setNotice('');
          setOpen(true);
        }}
      >
        {alreadyLinked ? 'Clerk · Connected' : 'Connect Clerk'}
      </button>
      {open && !alreadyLinked ? (
        <div role="group" aria-label="Connect Clerk">
          <p>
            Sign in to the Clerk account whose verified email matches this AllModelAI account.
            Your chats, credits, and subscription stay on this user.
          </p>
          <ClerkProvider publishableKey={clerkPublishableKey()} localization={clerkAuthLocalization()}>
            <ClerkLinkExchange
              onBusyChange={setBusy}
              onError={setNotice}
              onSuccess={() => {
                setOpen(false);
                onLinked?.();
              }}
            />
          </ClerkProvider>
          <button
            type="button"
            disabled={busy}
            onClick={() => setOpen(false)}
          >
            Cancel
          </button>
        </div>
      ) : null}
      {notice ? <p role="status">{notice}</p> : null}
    </div>
  );
}
