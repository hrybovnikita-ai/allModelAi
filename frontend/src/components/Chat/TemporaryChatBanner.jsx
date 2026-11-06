import { useEffect, useState } from 'react';
import { formatTemporaryRemaining, remainingMsFromExpiresAt } from './temporaryChatBannerHelpers.js';

/**
 * Compact Temporary Chat indicator + 72h countdown.
 * Colors inherit existing chat theme tokens; no palette changes.
 */
export default function TemporaryChatBanner({
  t,
  expiresAt,
  visible = true,
}) {
  const [remainingMs, setRemainingMs] = useState(() => remainingMsFromExpiresAt(expiresAt));

  useEffect(() => {
    if (!expiresAt) {
      setRemainingMs(0);
      return undefined;
    }
    const tick = () => setRemainingMs(remainingMsFromExpiresAt(expiresAt));
    tick();
    const timer = window.setInterval(tick, 30_000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);

  if (!visible) return null;

  const expired = Boolean(expiresAt) && remainingMs <= 0;
  const countdown = expiresAt
    ? (expired ? t('Expired') : formatTemporaryRemaining(remainingMs))
    : t('Expires in 72 hours');

  return (
    <div
      className={`temporary-chat-banner${expired ? ' is-expired' : ''}`}
      role="status"
      aria-live="polite"
    >
      <span className="temporary-chat-banner-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      </span>
      <span className="temporary-chat-banner-label">{t('Temporary Chat')}</span>
      <span className="temporary-chat-banner-sep" aria-hidden="true">·</span>
      <span
        className="temporary-chat-banner-countdown"
        title={`${t('This conversation expires 72 hours after creation')}. ${t('Providers may retain submitted content per their policies.')}`}
      >
        {expired ? t('This temporary chat has expired') : `${t('Expires in')} ${countdown}`}
      </span>
    </div>
  );
}
