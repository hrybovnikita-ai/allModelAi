import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatResetRemaining, usageLimitCopy } from '../../lib/usageLimitMessages';
import './UsageLimitWarning.css';

export default function UsageLimitWarning({ languageCode, resetAt, onExpired, showPlans = false }) {
  const copy = usageLimitCopy(languageCode);
  const [remaining, setRemaining] = useState(() => formatResetRemaining(resetAt, languageCode));

  useEffect(() => {
    if (!resetAt) {
      setRemaining(null);
      return undefined;
    }
    const tick = () => {
      const next = formatResetRemaining(resetAt, languageCode);
      setRemaining(next);
      if (!next) onExpired?.();
    };
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, [resetAt, languageCode, onExpired]);

  return (
    <aside className="usage-limit-warning" role="alert" aria-live="polite">
      <div className="usage-limit-warning__row">
        <span className="usage-limit-warning__icon" aria-hidden="true">!</span>
        <div>
          <strong>{copy.title}</strong>
          <p>{copy.body}</p>
          {remaining ? (
            <p className="usage-limit-warning__reset">
              <span aria-hidden="true">⏱</span> {copy.resetPrefix} {remaining}
            </p>
          ) : (
            <p className="usage-limit-warning__reset">{copy.later}</p>
          )}
          <div className="usage-limit-warning__actions">
            <Link to="/usage-analytics" className="usage-limit-warning__btn">{copy.viewUsage}</Link>
            {showPlans ? <Link to="/pricing" className="usage-limit-warning__btn usage-limit-warning__btn--ghost">{copy.viewPlans}</Link> : null}
          </div>
        </div>
      </div>
    </aside>
  );
}
