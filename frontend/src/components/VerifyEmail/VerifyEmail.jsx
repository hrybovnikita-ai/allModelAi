import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiFetch, parseJsonResponse } from '../../lib/api';

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [status, setStatus] = useState(token ? 'verifying' : 'missing');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) return undefined;
    let active = true;
    (async () => {
      try {
        const response = await apiFetch('/api/auth/verify/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const data = await parseJsonResponse(response);
        if (!active) return;
        if (!response.ok) {
          setStatus('error');
          setMessage(data.message || 'This verification link is invalid or has expired.');
          return;
        }
        setStatus('success');
        setMessage(data.message || 'Email verified. You can sign in now.');
      } catch {
        if (!active) return;
        setStatus('error');
        setMessage('Could not verify your email. Please try again later.');
      }
    })();
    return () => {
      active = false;
    };
  }, [token]);

  return (
    <main className="forgot-password-page" style={{ minHeight: '70vh', display: 'grid', placeItems: 'center', padding: '2rem' }}>
      <section className="forgot-password-card" style={{ maxWidth: 420, width: '100%' }}>
        <h1>Verify email</h1>
        {status === 'verifying' && <p role="status">Confirming your email…</p>}
        {status === 'missing' && (
          <p role="alert">Open the verification link from your email, or request a new one after signing up.</p>
        )}
        {status === 'success' && (
          <>
            <p role="status">{message}</p>
            <Link to="/login">Sign in</Link>
          </>
        )}
        {status === 'error' && (
          <>
            <p role="alert">{message}</p>
            <Link to="/login">Back to sign in</Link>
          </>
        )}
      </section>
    </main>
  );
}
