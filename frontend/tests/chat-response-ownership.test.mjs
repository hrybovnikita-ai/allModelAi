import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractAssistantText,
  patchAssistantMessage,
  responseBelongsToOpenChat,
  shouldBootstrapOpenConversation,
  shouldReplaceMessagesFromHistory,
  shouldShowBackgroundReplyNotice,
  sameConversationId,
} from '../src/lib/chatResponseOwnership.js';

test('sameConversationId compares ids as strings', () => {
  assert.equal(sameConversationId('abc', 'abc'), true);
  assert.equal(sameConversationId(12, '12'), true);
  assert.equal(sameConversationId(null, null), true);
  assert.equal(sameConversationId('a', 'b'), false);
});

test('responseBelongsToOpenChat keeps new-chat replies while id attaches', () => {
  assert.equal(responseBelongsToOpenChat({
    activeId: null,
    requestId: 'new-1',
    startedId: null,
  }), true);

  assert.equal(responseBelongsToOpenChat({
    activeId: 'new-1',
    requestId: 'new-1',
    startedId: null,
  }), true);
});

test('responseBelongsToOpenChat applies updates when assistant placeholder is still visible', () => {
  const messages = [
    { role: 'user', text: 'Hello' },
    { id: 'asst-1', role: 'assistant', text: '' },
  ];
  assert.equal(responseBelongsToOpenChat({
    activeId: null,
    requestId: 'conv-1',
    startedId: null,
    assistantMessageId: 'asst-1',
    messages,
  }), true);
});

test('responseBelongsToOpenChat rejects updates after switching conversations', () => {
  assert.equal(responseBelongsToOpenChat({
    activeId: 'other',
    requestId: 'conv-1',
    startedId: 'conv-1',
  }), false);
});

test('patchAssistantMessage updates by id and ignores undefined fields', () => {
  const messages = [
    { role: 'user', text: 'Hi' },
    { id: 'a1', role: 'assistant', text: '', modelSlug: 'smart', knowledgeSources: [{ id: 1 }] },
  ];
  const next = patchAssistantMessage(messages, { id: 'a1', index: 1 }, {
    text: 'Hello! How can I help you today?',
    content: 'Hello! How can I help you today?',
    knowledgeSources: undefined,
    status: 'completed',
  });
  assert.equal(next[1].text, 'Hello! How can I help you today?');
  assert.equal(next[1].content, 'Hello! How can I help you today?');
  assert.deepEqual(next[1].knowledgeSources, [{ id: 1 }]);
  assert.equal(next[1].status, 'completed');
});

test('patchAssistantMessage falls back to index and prevents duplicate assistants', () => {
  const messages = [
    { role: 'user', text: 'Hi' },
    { role: 'assistant', text: '' },
  ];
  const next = patchAssistantMessage(messages, { index: 1 }, { text: 'Done' });
  assert.equal(next.length, 2);
  assert.equal(next[1].text, 'Done');
});

test('extractAssistantText normalizes provider shapes', () => {
  assert.equal(extractAssistantText({ text: 'from-text' }), 'from-text');
  assert.equal(extractAssistantText({ message: 'from-message' }), 'from-message');
  assert.equal(extractAssistantText({ content: 'from-content' }), 'from-content');
  assert.equal(extractAssistantText({ choices: [{ message: { content: 'openai' } }] }), 'openai');
  assert.equal(extractAssistantText({ result: { response: 'cloudflare' } }), 'cloudflare');
  assert.equal(extractAssistantText({}), '');
});

test('shouldShowBackgroundReplyNotice never toasts in-view replies', () => {
  assert.equal(shouldShowBackgroundReplyNotice({
    belongsToOpenChat: true,
    hasAssistantText: true,
  }), false);
  assert.equal(shouldShowBackgroundReplyNotice({
    belongsToOpenChat: false,
    hasAssistantText: true,
  }), true);
  assert.equal(shouldShowBackgroundReplyNotice({
    belongsToOpenChat: false,
    hasAssistantText: false,
  }), false);
});

test('shouldReplaceMessagesFromHistory preserves richer in-flight local transcript', () => {
  assert.equal(shouldReplaceMessagesFromHistory({
    isSending: true,
    activeId: 'c1',
    historyConversationId: 'c1',
    localMessages: [
      { role: 'user', text: 'Hello' },
      { role: 'assistant', text: 'Hello! How can I help you today?' },
    ],
    historyMessages: [
      { role: 'user', text: 'Hello' },
    ],
  }), false);

  assert.equal(shouldReplaceMessagesFromHistory({
    isSending: false,
    activeId: 'c1',
    historyConversationId: 'c1',
    localMessages: [{ role: 'user', text: 'Hello' }],
    historyMessages: [
      { role: 'user', text: 'Hello' },
      { role: 'assistant', text: 'Saved reply' },
    ],
  }), true);
});

test('shouldBootstrapOpenConversation does not hijack New chat after first load', () => {
  assert.equal(shouldBootstrapOpenConversation({
    hasBootstrapped: false,
    activeId: null,
    localMessageCount: 0,
    historyFirstId: 'latest',
  }), true);

  assert.equal(shouldBootstrapOpenConversation({
    hasBootstrapped: true,
    activeId: null,
    localMessageCount: 0,
    historyFirstId: 'latest',
  }), false);

  assert.equal(shouldBootstrapOpenConversation({
    hasBootstrapped: true,
    activeId: null,
    isSending: true,
    localMessageCount: 2,
    historyFirstId: 'latest',
  }), false);
});
