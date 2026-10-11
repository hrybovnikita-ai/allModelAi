import { useCallback, useEffect, useState } from 'react';
import { useLanguage } from '../../lib/useLanguage';
import { normalizeCreditStatus } from '../../lib/creditStatus';
import { apiFetch } from '../../lib/api';
import { patchAccessMode } from '../../lib/accessMode';

export default function DeveloperModeSettings() {
  const { t } = useLanguage();
  const [creditStatus, setCreditStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadCredits = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await apiFetch('/api/credits');
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Could not load account access.');
      setCreditStatus(normalizeCreditStatus(data));
    } catch (requestError) {
      setError(requestError.message || 'Could not load account access.');
      setCreditStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCredits();
  }, [loadCredits]);

  const selectMode = async (mode) => {
    if (!creditStatus?.canManageOwnerMode || saving) return;
    if ((creditStatus.mode || 'user') === mode) return;
    setSaving(true);
    setError('');
    try {
      const next = await patchAccessMode(mode);
      setCreditStatus(normalizeCreditStatus(next));
      globalThis.dispatchEvent(new CustomEvent('allmodelai:access-mode-updated', { detail: next }));
    } catch (requestError) {
      setError(requestError.message || 'Could not update mode.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <section className="settings-panel developer-mode-panel" id="settings-developer-mode" aria-busy="true">
        <span className="settings-note">{t('Loading account access…')}</span>
      </section>
    );
  }

  if (!creditStatus?.canManageOwnerMode) {
    return null;
  }

  const plusSelected = creditStatus.mode === 'developer';

  return (
    <section className="settings-panel developer-mode-panel" id="settings-developer-mode">
      <div className="developer-mode-heading">
        <span>{t('Developer Mode')}</span>
        <span className="developer-mode-owner-badge" role="status">{t('Owner')}</span>
      </div>
      <h2>{t('User / Plus preview')}</h2>
      <p className="settings-note">
        {t('Switch how AllModelAI behaves for your account. Your complimentary Plus entitlement stays on the server; User mode previews the standard free experience.')}
      </p>
      <div
        className={`developer-mode-segment${saving ? ' developer-mode-segment--busy' : ''}`}
        role="group"
        aria-label={t('Developer Mode')}
      >
        <button
          type="button"
          className="developer-mode-segment__btn"
          aria-pressed={!plusSelected}
          disabled={saving}
          onClick={() => { void selectMode('user'); }}
        >
          {t('User')}
        </button>
        <button
          type="button"
          className="developer-mode-segment__btn developer-mode-segment__btn--plus"
          aria-pressed={plusSelected}
          disabled={saving}
          onClick={() => { void selectMode('developer'); }}
        >
          <span className="developer-mode-crown" aria-hidden="true">✦</span>
          {t('Plus')}
        </button>
      </div>
      <p className="developer-mode-status" role="status">
        {saving
          ? t('Saving…')
          : plusSelected
            ? t('Plus mode active — full owner entitlement.')
            : t('User mode active — free-plan limits and UI preview.')}
      </p>
      {error ? <p className="settings-error" role="alert">{error}</p> : null}
    </section>
  );
}
