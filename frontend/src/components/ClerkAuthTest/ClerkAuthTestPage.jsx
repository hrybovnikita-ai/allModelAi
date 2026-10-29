import { ClerkProvider, Show, SignIn, SignOutButton, SignUp, UserButton, useAuth, useUser } from '@clerk/react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authGet } from '../../lib/authApi';
import { clerkPublishableKey, isClerkPublishableKeyConfigured } from '../../lib/clerkTestConfig';
import { exchangeClerkSessionForAllModelAI } from '../../lib/clerkSessionExchange.js';
import './ClerkAuthTestPage.css';

function ClerkSessionPanel() {
  const navigate = useNavigate();
  const { getToken, isSignedIn } = useAuth();
  const { user } = useUser();
  const [panel, setPanel] = useState('sign-in');
  const [backendReady, setBackendReady] = useState(false);
  const [status, setStatus] = useState('Clerk session is not connected to AllModelAI yet.');
  const [busy, setBusy] = useState(false);

  const exchange = async () => {
    setBusy(true);
    setBackendReady(false);
    try {
      await exchangeClerkSessionForAllModelAI(getToken, { rememberMe: true });
      const response = await authGet('/api/auth/session');
      const data = await response.json();
      if (!data?.user?.email) {
        setStatus('AllModelAI did not confirm a session.');
        return;
      }
      setBackendReady(true);
      setStatus(`AllModelAI session confirmed for ${data.user.email}.`);
    } catch (error) {
      setStatus(error?.message || 'AllModelAI could not verify this Clerk sign-in.');
    } finally {
      setBusy(false);
    }
  };

  const displayName = user?.fullName || user?.primaryEmailAddress?.emailAddress || 'Signed in';

  return (
    <main className="clerk-test">
      <p className="clerk-test-banner">Development only. Firebase sign-in on /login is unchanged.</p>
      <h1>Clerk authentication test</h1>
      <Show when="signed-out">
        <p>Status: signed out of Clerk.</p>
        <div className="clerk-test-switch" role="tablist" aria-label="Clerk forms">
          <button type="button" role="tab" aria-selected={panel === 'sign-in'} onClick={() => setPanel('sign-in')}>Sign in</button>
          <button type="button" role="tab" aria-selected={panel === 'sign-up'} onClick={() => setPanel('sign-up')}>Sign up</button>
        </div>
        <p>Email and Google appear when they are enabled in the Clerk dashboard.</p>
        {panel === 'sign-in' ? <SignIn routing="hash" /> : <SignUp routing="hash" />}
      </Show>
      <Show when="signed-in">
        <p>Clerk status: signed in as {displayName}.</p>
        <UserButton />
        <div className="clerk-test-actions">
          <button type="button" onClick={exchange} disabled={busy || !isSignedIn}>Connect AllModelAI session</button>
          <button type="button" disabled={!backendReady} onClick={() => navigate('/dashboard')}>Test Dashboard</button>
          <SignOutButton>
            <button type="button">Sign out</button>
          </SignOutButton>
        </div>
        <p>Backend session: {backendReady ? 'confirmed' : 'not confirmed'}.</p>
        <p>{status}</p>
      </Show>
      <p><Link to="/login">AllModelAI email and Google sign-in</Link></p>
    </main>
  );
}

export default function ClerkAuthTestPage() {
  const publishableKey = clerkPublishableKey();
  if (!isClerkPublishableKeyConfigured()) {
    return (
      <main className="clerk-test">
        <h1>Clerk test</h1>
        <p>Set VITE_CLERK_PUBLISHABLE_KEY in frontend/.env or frontend/.env.local, then restart the dev server.</p>
        <Link to="/login">Back to AllModelAI sign-in</Link>
      </main>
    );
  }
  return (
    <ClerkProvider publishableKey={publishableKey}>
      <ClerkSessionPanel />
    </ClerkProvider>
  );
}
