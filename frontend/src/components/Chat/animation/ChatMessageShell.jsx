import { memo } from 'react';
import AnimatedMessage from './AnimatedMessage.jsx';

function ChatMessageShellInner({
  asAssistant = false,
  className = '',
  entrance = false,
  streaming = false,
  children,
}) {
  if (asAssistant) {
    return (
      <AnimatedMessage
        className={className}
        entrance={entrance}
        streaming={streaming}
      >
        {children}
      </AnimatedMessage>
    );
  }

  return (
    <article className={className}>
      {children}
    </article>
  );
}

export default memo(ChatMessageShellInner);
