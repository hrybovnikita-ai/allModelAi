import { useState } from 'react';
import { revealAnoninMessage } from '../../lib/anoninClient';
import './AnoninMessageReveal.css';

export default function AnoninMessageReveal({
  messageId,
  conversationId,
  revealed,
  revealData,
  onRevealed,
  disabled = false,
  translate = (v) => v,
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hidden, setHidden] = useState(false);

  if (!messageId || disabled) return null;

  const showReveal = !revealed || hidden;
  const data = revealData;

  const handleReveal = async () => {
    setLoading(true);
    setError('');
    try {
      const payload = await revealAnoninMessage({ messageId, conversationId });
      onRevealed?.(payload);
      setHidden(false);
    } catch (err) {
      setError(err.message || 'Could not reveal model');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="anonin-reveal" aria-live="polite">
      {showReveal && (
        <button
          type="button"
          className="anonin-reveal__btn"
          onClick={handleReveal}
          disabled={loading}
        >
          {loading ? translate('Revealing…') : translate('Reveal AI Model')}
        </button>
      )}
      {error && <p className="anonin-reveal__error" role="alert">{error}</p>}
      {revealed && data && !hidden && (
        <div className="anonin-reveal__answer">
          <p>
            {translate('Answered by')}
            {': '}
            <strong>{data.providerLabel}</strong>
            {' — '}
            <span>{data.modelLabel}</span>
          </p>
          {data.fallbackFromSlug && (
            <small className="anonin-reveal__fallback">
              {translate('A fallback provider was used when the first choice was unavailable.')}
            </small>
          )}
          <button type="button" className="anonin-reveal__hide" onClick={() => setHidden(true)}>
            {translate('Hide Model')}
          </button>
        </div>
      )}
      {revealed && hidden && (
        <button type="button" className="anonin-reveal__btn" onClick={() => setHidden(false)}>
          {translate('Show revealed model')}
        </button>
      )}
    </div>
  );
}
