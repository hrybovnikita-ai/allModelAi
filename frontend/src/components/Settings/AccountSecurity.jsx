import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../../lib/useLanguage';
import { validatePasswordEnrollmentForm } from '../../lib/authValidation';
import { fetchAccountSecurity, setAccountPassword } from '../../lib/accountSecurity';

const PROVIDER_LABELS = {
  'google.com': 'Google',
  'github.com': 'GitHub',
  'apple.com': 'Apple',
};

export default function AccountSecurity() {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [passwordEnabled, setPasswordEnabled] = useState(false);
  const [providers, setProviders] = useState([]);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    let active = true;
    void fetchAccountSecurity()
      .then((data) => {
        if (!active) return;
        setPasswordEnabled(Boolean(data?.passwordEnabled));
        setProviders(Array.isArray(data?.providers) ? data.providers : []);
      })
      .catch((requestError) => {
        if (!active) return;
        setError(requestError.message || 'Could not load security settings.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const providerSummary = providers
    .map((provider) => PROVIDER_LABELS[provider] || provider)
    .join(', ');

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    const validation = validatePasswordEnrollmentForm(
      { newPassword, confirmPassword, currentPassword },
      { passwordEnabled },
    );
    if (!validation.ok) {
      setError(validation.message);
      return;
    }
    try {
      setSubmitting(true);
      const result = await setAccountPassword(validation.payload);
      setPasswordEnabled(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSuccess(result?.message || t('passwordSaved'));
    } catch (requestError) {
      setError(requestError.message || 'Could not save your password.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="settings-card settings-security">
      <div>
        <span>{t('security')}</span>
        <h2>{t('securityHeading')}</h2>
        {providerSummary ? (
          <p className="settings-security-hint">
            {t('connectedProviders')}
            {': '}
            {providerSummary}
          </p>
        ) : null}
        {!passwordEnabled ? (
          <p className="settings-security-hint">{t('setPasswordHint')}</p>
        ) : null}
      </div>

      {loading ? (
        <p className="settings-security-hint" role="status">{t('loadingSecurity')}</p>
      ) : (
        <form className="settings-password-form" onSubmit={handleSubmit}>
          {passwordEnabled ? (
            <label>
              {t('currentPassword')}
              <input
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            </label>
          ) : null}
          <label>
            {passwordEnabled ? t('newPassword') : t('setPassword')}
            <input
              type="password"
              autoComplete={passwordEnabled ? 'new-password' : 'new-password'}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              minLength={8}
            />
          </label>
          <label>
            {t('confirmPassword')}
            <input
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              minLength={8}
            />
          </label>
          {error ? <p className="settings-password-error" role="alert">{error}</p> : null}
          {success ? <p className="settings-password-success" role="status">{success}</p> : null}
          <div className="settings-password-actions">
            <button type="submit" className="settings-save" disabled={submitting}>
              {passwordEnabled ? t('changePassword') : t('setPassword')}
            </button>
            <Link className="settings-security-link" to="/forgot-password">{t('forgotPasswordLink')}</Link>
          </div>
        </form>
      )}
    </section>
  );
}
