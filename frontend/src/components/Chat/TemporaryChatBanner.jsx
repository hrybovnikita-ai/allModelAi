import { useEffect, useState } from 'react';

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

export function formatTemporaryRemaining(remainingMs) {
  const ms = Math.max(0, Number(remainingMs) || 0);
  const hours = Math.floor(ms / HOUR_MS);
  const minutes = Math.floor((ms % HOUR_MS) / MINUTE_MS);
  if (hours >= 48) {
    const days = Math.floor(hours / 24);
    const remHours = hours % 24;
    return `${days}d ${remHours}h`;
  }
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${Math.max(1, minutes)}m`;
}

export function remainingMsFromExpiresAt(expiresAt, now = Date.now()) {
  const expiresMs = Date.parse(String(expiresAt || ''));
  if (!Number.isFinite(expiresMs)) return 0;
  return Math.max(0, expiresMs - now);
}

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
