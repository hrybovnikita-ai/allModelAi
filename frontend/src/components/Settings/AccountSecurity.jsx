import { useEffect, useState } from 'react';
import { useLanguage } from '../../lib/useLanguage';
import { fetchAccountSecurity } from '../../lib/accountSecurity.js';
import SetAllModelAiPasswordForm from './SetAllModelAiPasswordForm.jsx';

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
  const [error, setError] = useState('');

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
        if (requestError.status === 404) {
          setError(
            'Password settings are unavailable on this server. Restart the backend (node server.js) so /api/auth/account/security is registered.',
          );
          return;
        }
        if (requestError.status === 401) {
          setError('Your session expired. Sign in again, then return to Settings.');
          return;
        }
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

  return (
    <section id="settings-security" className="settings-card settings-security">
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
      ) : null}
      {!loading && error ? (
        <p className="settings-password-error" role="alert">{error}</p>
      ) : null}
      {!loading && !error ? (
        <SetAllModelAiPasswordForm
          passwordEnabled={passwordEnabled}
          onSuccess={(result) => {
            if (result?.passwordEnabled) setPasswordEnabled(true);
          }}
        />
      ) : null}
    </section>
  );
}
