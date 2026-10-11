import { pickAiSticker, shouldSkipStickersForMessage } from './pickSticker.js';
import { readAiStickersEnabled } from './settings.js';

export function attachAiStickerToAssistantMessage(message, { userText = '', enabled } = {}) {
  if (!message || message.role !== 'assistant') return message;
  const stickersOn = enabled ?? readAiStickersEnabled();
  if (!stickersOn || shouldSkipStickersForMessage(message)) return message;
  if (message.aiSticker?.emoji) return message;

  const assistantText = String(message.text || message.content || '');
  const pick = pickAiSticker(userText, assistantText);
  if (!pick) return message;

  return {
    ...message,
    aiSticker: {
      id: pick.id,
      emoji: pick.emoji,
      label: pick.label,
      animated: pick.animated,
      confidence: pick.confidence,
    },
  };
}

export function stickerFieldsForPersist(message) {
  if (!message?.aiSticker?.emoji) return {};
  return {
    aiSticker: {
      id: message.aiSticker.id,
      emoji: message.aiSticker.emoji,
      label: message.aiSticker.label,
      animated: Boolean(message.aiSticker.animated),
    },
  };
}

export function finalizeAssistantMessage(partial = {}, { userText = '', enabled } = {}) {
  const base = { role: 'assistant', ...partial };
  const text = String(base.text ?? base.content ?? '');
  return attachAiStickerToAssistantMessage(
    { ...base, text, content: text },
    { userText, enabled },
  );
}
