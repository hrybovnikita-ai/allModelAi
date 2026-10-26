import { useLanguage } from '../../lib/useLanguage';
import './PremiumUpgradeModal.css';

export default function PremiumUpgradeModal({ open, modelName, onSubscribe, onDismiss }) {
  const { t } = useLanguage();
  if (!open) return null;

  return (
    <div className="premium-upgrade-backdrop" role="presentation" onClick={onDismiss}>
      <section
        className="premium-upgrade-modal"
        role="dialog"
        aria-labelledby="premium-upgrade-title"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="premium-upgrade-eyebrow">{t('Premium Model')}</p>
        <h2 id="premium-upgrade-title">{t('Unlock Premium AI Models')}</h2>
        <p className="premium-upgrade-copy">
          {t('Get access to powerful AI models with AllModelAI Pro.')}
        </p>
        <div className="premium-upgrade-actions">
          <button type="button" className="premium-upgrade-primary" onClick={onSubscribe}>
            {t('Subscribe')}
          </button>
          <button type="button" className="premium-upgrade-secondary" onClick={onDismiss}>
            {t('Maybe later')}
          </button>
        </div>
      </section>
    </div>
  );
}
