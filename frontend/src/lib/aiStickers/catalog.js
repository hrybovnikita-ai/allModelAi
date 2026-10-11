/** Emoji-style AI chat stickers (not brand dragon assets). */

export const AI_STICKER_CATALOG = {
  greeting: {
    id: 'greeting',
    emoji: '😄',
    label: 'Greeting',
    animated: true,
    keywords: [/^(hi|hello|hey|good morning|good evening|привет|здравств|вітаю|hola|bonjour)\b/i],
  },
  funny: {
    id: 'funny',
    emoji: '😂',
    label: 'Funny',
    animated: true,
    keywords: [/\b(lol|haha|funny|joke|😂|смешн|жарт)\b/i],
  },
  celebration: {
    id: 'celebration',
    emoji: '🎉',
    label: 'Celebration',
    animated: true,
    keywords: [/\b(congrat|celebrat|awesome|amazing|yay|ура|вітай|party|🎉)\b/i],
  },
  excitement: {
    id: 'excitement',
    emoji: '🥳',
    label: 'Excitement',
    animated: true,
    keywords: [/\b(excited|can't wait|let's go|woohoo|🥳|круто|супер)\b/i],
  },
  thinking: {
    id: 'thinking',
    emoji: '🤔',
    label: 'Thinking',
    animated: false,
    keywords: [/\b(consider|perhaps|maybe|not sure|depends|🤔|можливо|думаю)\b/i],
  },
  confidence: {
    id: 'confidence',
    emoji: '😎',
    label: 'Confidence',
    animated: false,
    keywords: [/\b(absolutely|definitely|certainly|no problem|got you|😎|звісно|без проблем)\b/i],
  },
  love: {
    id: 'love',
    emoji: '❤️',
    label: 'Appreciation',
    animated: true,
    keywords: [/\b(thank you|thanks|grateful|appreciate|love|❤️|дякую|спасибо)\b/i],
  },
  encouragement: {
    id: 'encouragement',
    emoji: '💪',
    label: 'Encouragement',
    animated: true,
    keywords: [/\b(you can|keep going|don't give up|believe|💪|ти можеш|не здавайся)\b/i],
  },
  success: {
    id: 'success',
    emoji: '✅',
    label: 'Success',
    animated: false,
    keywords: [/\b(done|completed|success|fixed|resolved|✅|готово|виправлено)\b/i],
  },
  sympathy: {
    id: 'sympathy',
    emoji: '🙂',
    label: 'Supportive',
    animated: false,
    keywords: [/\b(sorry|unfortunately|sad| tough|difficult|вибач|на жаль)\b/i],
  },
};

export const AI_STICKER_LIST = Object.values(AI_STICKER_CATALOG);
