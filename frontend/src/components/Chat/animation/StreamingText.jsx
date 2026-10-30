import { memo } from 'react';
import { useReducedMotion } from 'framer-motion';
import './ChatMessageAnimations.css';

/** Plain streamed text + cursor — no entrance animation on token updates. */
function StreamingTextInner({ text = '', active = false, className = '' }) {
  const reduceMotion = useReducedMotion();
  const value = String(text || '');

  return (
    <p
      className={`message-stream-plain streaming-text ${className}`.trim()}
      aria-busy={active ? 'true' : undefined}
    >
      <span className="streaming-text__body">{value}</span>
      {active ? (
        <span
          className={`stream-cursor streaming-text__cursor${reduceMotion ? ' stream-cursor--static' : ''}`}
          aria-hidden="true"
        />
      ) : null}
    </p>
  );
}

export default memo(StreamingTextInner);
