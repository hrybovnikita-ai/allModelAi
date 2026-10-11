import test from 'node:test';
import assert from 'node:assert/strict';
import { pickAiSticker } from '../src/lib/aiStickers/pickSticker.js';
import { attachAiStickerToAssistantMessage } from '../src/lib/aiStickers/enhanceMessage.js';

test('pickAiSticker detects greeting', () => {
  const pick = pickAiSticker('Hello, AllModelAI!', 'Hello! I am happy to see you. How can I help you today?', {
    random: () => 0.99,
  });
  assert.ok(pick);
  assert.equal(pick.id, 'greeting');
  assert.equal(pick.emoji, '😄');
});

test('pickAiSticker skips code-heavy replies', () => {
  const code = 'Here is the fix:\n```js\nconst x = 1;\n```'.repeat(20);
  const pick = pickAiSticker('fix my code', code, { random: () => 0.99 });
  assert.equal(pick, null);
});

test('attachAiSticker persists sticker object on message', () => {
  let sticker = null;
  for (let attempt = 0; attempt < 24 && !sticker; attempt += 1) {
    const msg = attachAiStickerToAssistantMessage(
      { role: 'assistant', text: 'Thank you so much! I really appreciate your message.' },
      { userText: 'thank you', enabled: true },
    );
    if (msg.aiSticker?.emoji) sticker = msg.aiSticker;
  }
  assert.ok(sticker?.emoji);
});
