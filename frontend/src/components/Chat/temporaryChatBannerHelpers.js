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
