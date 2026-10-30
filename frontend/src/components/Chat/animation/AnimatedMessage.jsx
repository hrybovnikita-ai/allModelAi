import { memo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { messageEntrance, messageEntranceTransition } from './motionPresets.js';
import './ChatMessageAnimations.css';

function AnimatedMessageInner({
  className = '',
  children,
  entrance = false,
  streaming = false,
  as = 'article',
  ...rest
}) {
  const reduceMotion = useReducedMotion();
  const Component = motion[as] || motion.article;
  const shouldAnimate = entrance && !reduceMotion;

  return (
    <Component
      className={`chat-message-animated ${streaming ? 'chat-message-animated--streaming' : ''} ${className}`.trim()}
      initial={shouldAnimate ? 'hidden' : false}
      animate="visible"
      variants={messageEntrance}
      transition={messageEntranceTransition}
      layout={false}
      {...rest}
    >
      {children}
    </Component>
  );
}

export default memo(AnimatedMessageInner);
