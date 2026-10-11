import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSuggestionsContextKey,
  parseSuggestionsContextKey,
} from '../src/components/Chat/chatContextSuggestionsHelpers.js';

describe('chat context suggestions helpers', () => {
  test('buildSuggestionsContextKey prefers draft over history', () => {
    const key = buildSuggestionsContextKey({
      prompt: 'Explain React useEffect in detail',
      messages: [{ role: 'user', text: 'Previous long user message here' }],
      activeConversationId: 'c1',
      selectedSkill: null,
    });
    assert.equal(key, 'draft::Explain React useEffect in detail');
  });

  test('parseSuggestionsContextKey round-trips history keys', () => {
    const text = 'Make me game in Python Space Shooter';
    const key = `history::conv-1::${text}`;
    assert.equal(parseSuggestionsContextKey(key), text);
  });

  test('buildSuggestionsContextKey skips image skill mode', () => {
    assert.equal(
      buildSuggestionsContextKey({
        prompt: 'long enough prompt text',
        messages: [],
        activeConversationId: null,
        selectedSkill: 'image',
      }),
      '',
    );
  });
});
