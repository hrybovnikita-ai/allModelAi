import { AI_STICKER_CATALOG, AI_STICKER_LIST } from './catalog.js';

const CODE_HEAVY = /```[\s\S]*```|<\/?[a-z][\s\S]*>/i;
const SKIP_ASSISTANT = /^(error|failed|could not|unable to|i cannot|sorry,? i)/i;

function scoreSticker(def, userText, assistantText) {
  const blob = `${userText}\n${assistantText}`.toLowerCase();
  let score = 0;
  for (const re of def.keywords) {
    if (re.test(userText)) score += 2.5;
    if (re.test(assistantText)) score += 1.5;
    if (re.test(blob)) score += 0.5;
  }
  return score;
}

/**
 * Pick at most one sticker. Returns null when tone is neutral or confidence is low.
 */
export function pickAiSticker(userText = '', assistantText = '', { random = Math.random } = {}) {
  const user = String(userText || '').trim();
  const assistant = String(assistantText || '').trim();
  if (!assistant || assistant.length < 8) return null;
  if (SKIP_ASSISTANT.test(assistant)) return null;
  if (CODE_HEAVY.test(assistant) && assistant.length > 400) return null;

  let best = null;
  let bestScore = 0;
  for (const def of AI_STICKER_LIST) {
    const score = scoreSticker(def, user, assistant);
    if (score > bestScore) {
      bestScore = score;
      best = def;
    }
  }

  if (!best || bestScore < 1.5) {
    if (/\b(hi|hello|hey|привет|вітаю)\b/i.test(user) && assistant.length < 280) {
      best = AI_STICKER_CATALOG.greeting;
      bestScore = 2;
    } else {
      return null;
    }
  }

  const confidence = Math.min(1, bestScore / 5);
  if (confidence < 0.35) return null;

  const neutralSkipChance = confidence < 0.55 ? 0.55 : confidence < 0.75 ? 0.28 : 0.12;
  if (random() < neutralSkipChance) return null;

  return {
    id: best.id,
    emoji: best.emoji,
    label: best.label,
    animated: Boolean(best.animated),
    confidence: Number(confidence.toFixed(2)),
  };
}

export function shouldSkipStickersForMessage(message = {}) {
  if (message.role !== 'assistant') return true;
  if (message.generatingFile || message.generatingImage || message.generatingVideo) return true;
  if (message.deepResearchClarification) return true;
  if (message.imageUrl || message.videoUrl || message.videoJobId) return true;
  return false;
}
