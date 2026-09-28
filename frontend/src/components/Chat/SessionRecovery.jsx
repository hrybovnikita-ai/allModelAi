import { confirmSession } from '../../lib/session';
import { useState } from 'react';
import { resolveAuthApiUrl } from '../../lib/authApi';
import { parseJsonResponse } from '../../lib/api';
import { nativeClientHeaders } from '../../lib/apiBase';

export default function SessionRecovery({ user, onSuccess }) {
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const signIn = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const password = new FormData(form).get('password');
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch(resolveAuthApiUrl('login'), {
        method: 'POST',
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...nativeClientHeaders(),
        },
        body: JSON.stringify({ name: user.name, email: user.email, password }),
      });
      const data = await parseJsonResponse(response);
      if (!response.ok) throw new Error(data.message || 'Could not sign in. Please try again.');
      if (data.user?.email?.toLowerCase() !== user.email.toLowerCase()) {
        throw new Error('Please sign in with the account that owns this conversation.');
      }
      await confirmSession(data.user);
      form.reset();
      onSuccess();
    } catch (requestError) {
      setError(requestError.message || 'Could not sign in. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return <form className="chat-session-recovery" onSubmit={signIn}>
    <label>Email<input type="email" name="username" value={user.email} autoComplete="username" readOnly /></label>
    <label>Password<input type="password" name="password" autoComplete="current-password" required disabled={submitting} /></label>
    {error && <p role="alert">{error}</p>}
    <button type="submit" disabled={submitting}>{submitting ? 'Signing in...' : 'Sign in without leaving chat'}</button>
  </form>;
}
