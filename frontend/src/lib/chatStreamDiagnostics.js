/**
 * Dev-friendly chat timing (no secrets). Logs only when logger is enabled.
 */

import { logger, isLoggerEnabled } from './logger.js';

export function createChatStreamDiagnostics() {
  const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
  let firstTokenAt = null;
  let provider = null;
  let completed = false;

  return {
    markFirstToken(extra = {}) {
      if (firstTokenAt != null) return;
      firstTokenAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (isLoggerEnabled()) {
        logger.chat('Time to first token', {
          ttftMs: Math.round(firstTokenAt - startedAt),
          ...extra,
        });
      }
    },
    setProvider(name) {
      if (name) provider = String(name);
    },
    markComplete(extra = {}) {
      completed = true;
      const endedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (isLoggerEnabled()) {
        logger.chat('Stream completed', {
          totalMs: Math.round(endedAt - startedAt),
          ttftMs: firstTokenAt != null ? Math.round(firstTokenAt - startedAt) : null,
          provider: provider || undefined,
          ...extra,
        });
      }
    },
    markAborted() {
      if (isLoggerEnabled()) {
        logger.chat('Stream aborted', {
          elapsedMs: Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt),
          provider: provider || undefined,
        });
      }
    },
    isComplete() {
      return completed;
    },
  };
}
