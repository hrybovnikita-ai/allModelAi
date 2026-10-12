import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchPublicJson } from '../../lib/publicCache';
import './RainbowExperience.css';

const cards = [
  { number: '01', title: 'Think in every color.', text: 'Explore different models and find a fresh perspective for your next big idea.', to: '/explore', action: 'Explore models', style: 'spectrum' },
  { number: '02', title: 'Make something brilliant.', text: 'Turn a first thought into a conversation, a plan, or a creative starting point.', to: '/chat', action: 'Start creating', style: 'glow' },
  { number: '03', title: 'Find your next spark.', text: 'Discover prompts that help you move from a blank page to a new possibility.', to: '/prompts', action: 'Discover prompts', style: 'prism' },
];
export default function RainbowExperience() {
  const [paused, setPaused] = useState(false);
  const [status, setStatus] = useState(null);
  const [statusError, setStatusError] = useState(false);
  const [statusLoading, setStatusLoading] = useState(true);
  const refresh = useCallback((force = false) => {
    if (document.hidden && !force) return;
    setStatusLoading(true);
    fetchPublicJson('/api/status/models', { force }).then((data) => {
      setStatus(data);
      setStatusError(false);
    }).catch(() => {
      setStatusError(true);
    }).finally(() => {
      setStatusLoading(false);
    });
  }, []);
  useEffect(() => {
    refresh(false);
    const timer = setInterval(() => refresh(false), 30000);
    const onVisible = () => refresh(false);
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [refresh]);
  function spotlight(event) {
    if (paused || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty('--pointer-x', ((event.clientX - rect.left) / rect.width * 100) + '%');
    event.currentTarget.style.setProperty('--pointer-y', ((event.clientY - rect.top) / rect.height * 100) + '%');
  }
  const configured = status ? Object.values(status.models || {}).filter(Boolean).length : null;
  return (
    <section className={'rainbow-experience' + (paused ? ' effects-paused' : '')} aria-labelledby="rainbow-title">
      <div className="rainbow-heading">
        <div><p className="rainbow-eyebrow">A little color. Endless possibilities.</p>
          <h2 id="rainbow-title">Your ideas, <span>in full spectrum.</span></h2></div>
        <button type="button" aria-pressed={paused} onClick={() => setPaused(!paused)}>{paused ? 'Resume effects' : 'Pause effects'}</button>
      </div>
      <div className="rainbow-cards">
        {cards.map((card) => (
          <Link key={card.number} to={card.to} className={'rainbow-card ' + card.style} onPointerMove={spotlight}>
            <span className="rainbow-orb" aria-hidden="true" />
            <span className="rainbow-number">{card.number} / ALLMODEL AI</span>
            <h3>{card.title}</h3><p>{card.text}</p>
            <span className="rainbow-action">{card.action} <span aria-hidden="true">&rarr;</span></span>
          </Link>
        ))}
      </div>
      <p className="rainbow-availability">
        {statusLoading && configured === null && !statusError && 'Checking model configuration…'}
        {!statusLoading && configured === null && statusError && (
          <>Model configuration is temporarily unavailable.{' '}
            <button type="button" className="rainbow-retry-link" onClick={() => refresh(true)}>Retry</button>
          </>
        )}
        {configured !== null && (
          <>
            {configured} provider groups configured{statusError ? ' (last known)' : ''}. Availability depends on provider quota and service status.
            {statusError && (
              <>{' '}
                <button type="button" className="rainbow-retry-link" onClick={() => refresh(true)}>Refresh</button>
              </>
            )}
          </>
        )}
      </p>
    </section>
  );
}
