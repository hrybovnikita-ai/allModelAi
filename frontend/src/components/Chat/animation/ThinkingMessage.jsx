import { memo } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import AnimatedMessage from './AnimatedMessage.jsx';
import ThinkingDot from './ThinkingDot.jsx';
import { thinkingEnter, thinkingExit } from './motionPresets.js';
import './ChatMessageAnimations.css';

function ThinkingMessageInner({ show, modelName, modelImage, label = 'Thinking' }) {
  const reduceMotion = useReducedMotion();

  return (
    <AnimatePresence mode="wait">
      {show ? (
        <AnimatedMessage
          key="assistant-thinking"
          className="chat-message assistant thinking-message"
          entrance={!reduceMotion}
          aria-busy="true"
        >
          <span className="thinking-avatar thinking-avatar--violet" aria-hidden="true">
            {modelImage ? (
              <img src={modelImage} alt="" />
            ) : (
              <i />
            )}
          </span>
          <div className="thinking-message__body">
            <small>{modelName}</small>
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : thinkingExit}
              transition={thinkingEnter.transition}
            >
              <ThinkingDot label={label} />
            </motion.div>
          </div>
        </AnimatedMessage>
      ) : null}
    </AnimatePresence>
  );
}

export default memo(ThinkingMessageInner);
