import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { validatePasswordEnrollmentForm } from '../../lib/authValidation.js';
import { setAccountPassword } from '../../lib/accountSecurity.js';
import { linkEmailPasswordToCurrentFirebaseUser } from '../../lib/linkEmailPassword.js';
import { restoreSession } from '../../lib/session.js';
import './Settings.css';

/**
 * Secure AllModelAI password enrollment for the signed-in account.
 * Requires explicit confirmation. Never stores the password in localStorage,
 * sessionStorage, or the URL. Never asks for a Google account password.
 */
export default function SetAllModelAiPasswordForm({
  passwordEnabled = false,
  email = '',
  onSuccess,
  showForgotLink = true,
  compact = false,
}) {
  const [enabled, setEnabled] = useState(passwordEnabled);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    setEnabled(passwordEnabled);
  }, [passwordEnabled]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    if (!enabled && !confirmed) {
      setError('Confirm that you want to add Email/Password sign-in to this account.');
      return;
    }
    const validation = validatePasswordEnrollmentForm(
      { newPassword, confirmPassword, currentPassword },
      { passwordEnabled: enabled },
    );
    if (!validation.ok) {
      setError(validation.message);
      return;
    }
    const nextPassword = validation.payload.newPassword;
    try {
      setSubmitting(true);
      const result = await setAccountPassword(validation.payload);
      const firebaseLink = await linkEmailPasswordToCurrentFirebaseUser(email, nextPassword);
      setEnabled(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setConfirmed(false);
      setPasswordVisible(false);
      const backendMessage = result?.message
        || (enabled
          ? 'Password updated.'
          : 'AllModelAI password saved. You can sign in with email and password or Google.');
      if (!enabled && firebaseLink?.linked === false && (
        firebaseLink?.reason === 'firebase-user-mismatch'
        || firebaseLink?.reason === 'auth/credential-already-in-use'
        || firebaseLink?.reason === 'auth/email-already-in-use'
      )) {
        setSuccess(
          `${backendMessage} Email/Password will work on AllModelAI. Open Settings after signing in with Google if you also want this password linked in Firebase.`,
        );
      } else {
        setSuccess(backendMessage);
      }
      if (result?.sessionRevoked) {
        await restoreSession({ force: true });
      }
      onSuccess?.(result);
    } catch (requestError) {
      setError(requestError.message || 'Could not save your password.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      className={`settings-password-form${compact ? ' settings-password-form--compact' : ''}`}
      onSubmit={handleSubmit}
    >
      <p className="settings-security-hint">
        This creates a separate AllModelAI password for your existing account.
        It is never your Google password. Your account id, chats, credits, and
        subscription stay the same.
      </p>
      {enabled ? (
        <label>
          Current AllModelAI password
          <input
            type={passwordVisible ? 'text' : 'password'}
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
        </label>
      ) : null}
      <label>
        {enabled ? 'New AllModelAI password' : 'AllModelAI password'}
        <span className="password-field">
          <input
            type={passwordVisible ? 'text' : 'password'}
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            minLength={8}
            required
          />
          <button
            type="button"
            className="password-toggle"
            onClick={() => setPasswordVisible((value) => !value)}
            aria-label={passwordVisible ? 'Hide password' : 'Show password'}
            aria-pressed={passwordVisible}
          >
            {passwordVisible ? '◉' : '◎'}
          </button>
        </span>
      </label>
      <label>
        Confirm AllModelAI password
        <input
          type={passwordVisible ? 'text' : 'password'}
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          minLength={8}
          required
        />
      </label>
      {!enabled ? (
        <label className="settings-password-confirm">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          <span>
            I confirm I want to add Email/Password sign-in to this Google account.
            This does not change my Google password.
          </span>
        </label>
      ) : null}
      {success ? <p className="settings-password-success" role="status">{success}</p> : null}
      {error ? <p className="settings-password-error" role="alert">{error}</p> : null}
      <div className="settings-password-actions">
        <button
          type="submit"
          className="settings-save"
          disabled={submitting || (!enabled && !confirmed)}
        >
          {submitting ? 'Saving…' : enabled ? 'Update password' : 'Set AllModelAI password'}
        </button>
        {showForgotLink ? (
          <Link className="settings-security-link" to="/forgot-password">Forgot password?</Link>
        ) : null}
      </div>
    </form>
  );
}
