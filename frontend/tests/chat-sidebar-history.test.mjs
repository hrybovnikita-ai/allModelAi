import test from 'node:test';
import assert from 'node:assert/strict';

import {
  groupConversationsByDate,
  conversationDisplayTitle,
  getConversationTimestamp,
} from '../src/lib/chatSidebarHistory.js';

test('conversationDisplayTitle prefers backend title', () => {
  const preview = () => 'fallback preview';
  assert.equal(conversationDisplayTitle({ title: 'My chat' }, preview), 'My chat');
  assert.equal(conversationDisplayTitle({ title: '  ' }, preview), 'fallback preview');
});

test('groupConversationsByDate separates pinned and time buckets', () => {
  const now = Date.now();
  const conversations = [
    { id: 'a', title: 'Today chat', updatedAt: new Date(now).toISOString(), model: 'gpt' },
    { id: 'b', title: 'Old chat', updatedAt: new Date(now - 86400000 * 10).toISOString(), model: 'claude' },
  ];
  const grouped = groupConversationsByDate(conversations, { a: { pinned: true } });
  assert.equal(grouped.pinned.length, 1);
  assert.equal(grouped.pinned[0].id, 'a');
  assert.ok(grouped.groups.some((g) => g.items.some((c) => c.id === 'b')));
  assert.ok(getConversationTimestamp(conversations[0]) > 0);
});
