import { memo } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import ChatMessageContent from './ChatMessageContent';
import ThinkingDot from './animation/ThinkingDot.jsx';
import { messageEntrance, messageEntranceTransition } from './animation/motionPresets.js';
import './ChatResponseBlock.css';

function ChatResponseBlockInner({
  text = '',
  streaming = false,
  waitingForFirstToken = false,
  status = null,
  generationStopped = false,
  citationSources = null,
  conversationId = null,
  thinkingLabel = 'Thinking',
  stickerSlot = null,
}) {
  const reduceMotion = useReducedMotion();
  const trimmed = String(text || '').trim();
  const hasText = Boolean(trimmed);
  const showThinking = waitingForFirstToken && !hasText;
  const showBody = hasText;

  return (
    <div
      className={[
        'chat-response-block',
        streaming ? 'chat-response-block--streaming' : '',
        showThinking ? 'chat-response-block--thinking' : '',
        status === 'error' ? 'chat-response-block--error' : '',
      ].filter(Boolean).join(' ')}
    >
      <AnimatePresence mode="wait" initial={false}>
        {showThinking ? (
          <motion.div
            key="chat-response-thinking"
            className="chat-response-block__thinking"
            initial={reduceMotion ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, scale: 0.96, filter: 'blur(4px)' }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            aria-busy="true"
          >
            <ThinkingDot label={thinkingLabel} />
          </motion.div>
        ) : null}

        {showBody ? (
          <motion.div
            key="chat-response-body"
            className="chat-response-block__body"
            initial={reduceMotion ? false : 'hidden'}
            animate="visible"
            variants={messageEntrance}
            transition={messageEntranceTransition}
          >
            <ChatMessageContent
              text={text}
              streaming={streaming}
              citationSources={citationSources}
              conversationId={conversationId}
            />
            {generationStopped && (
              <p className="chat-response-block__stopped" role="status">
                Generation stopped. Partial response shown.
              </p>
            )}
            {stickerSlot}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export default memo(ChatResponseBlockInner);
