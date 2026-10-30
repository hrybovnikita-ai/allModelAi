import { memo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import './ChatMessageAnimations.css';

function ThinkingDotInner({ label = 'Thinking', className = '' }) {
  const reduceMotion = useReducedMotion();

  return (
    <div className={`thinking-dot-wrap ${className}`.trim()} role="status" aria-live="polite" aria-label={label}>
      <span className="thinking-dot-slot" aria-hidden="true">
        <motion.span
          className="thinking-dot-glow"
          animate={reduceMotion ? undefined : {
            scale: [0.85, 1.35, 0.85],
            opacity: [0.35, 0.7, 0.35],
          }}
          transition={reduceMotion ? undefined : {
            duration: 1.8,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
        <motion.span
          className="thinking-dot-core"
          animate={reduceMotion ? undefined : {
            scale: [1, 1.12, 1],
            opacity: [0.75, 1, 0.75],
          }}
          transition={reduceMotion ? undefined : {
            duration: 1.4,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      </span>
      <span className="thinking-dot-label">{label}</span>
    </div>
  );
}

export default memo(ThinkingDotInner);
