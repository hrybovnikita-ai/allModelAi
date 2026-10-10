import { useLanguage } from '../../lib/useLanguage';
import './ConnectionIssueBanner.css';

export default function ConnectionIssueBanner({
  message,
  onRetry,
  retrying = false,
  compact = false,
}) {
  const { t } = useLanguage();
  if (!message) return null;

  return (
    <div
      className={`connection-issue-banner${compact ? ' connection-issue-banner--compact' : ''}`}
      role="alert"
      aria-live="polite"
    >
      <p className="connection-issue-banner__text">{message}</p>
      {onRetry && (
        <button
          type="button"
          className="connection-issue-banner__retry"
          disabled={retrying}
          onClick={() => { void onRetry(); }}
        >
          {retrying ? t('Retrying…') : t('Retry')}
        </button>
      )}
    </div>
  );
}
