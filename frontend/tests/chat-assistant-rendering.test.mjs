import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const chatSource = readFileSync(path.join(root, 'src/components/Chat/Chat.jsx'), 'utf8');

test('Chat uses ownership helpers instead of toast-only assistant delivery', () => {
  assert.match(chatSource, /from '\.\.\/\.\.\/lib\/chatResponseOwnership'/);
  assert.match(chatSource, /conversationOwnsResponse/);
  assert.match(chatSource, /patchAssistantMessage/);
  assert.match(chatSource, /shouldShowBackgroundReplyNotice/);
  assert.match(chatSource, /extractAssistantText/);
  assert.match(chatSource, /shouldBootstrapOpenConversation/);
});

test('Chat creates a stable assistant placeholder before the request', () => {
  assert.match(chatSource, /const assistantMessageId =/);
  assert.match(chatSource, /role: 'assistant'/);
  assert.match(chatSource, /status: 'pending'/);
  assert.match(chatSource, /applyAssistantPatch/);
});

test('Chat does not gate stream text only on strict ref equality', () => {
  assert.doesNotMatch(
    chatSource,
    /activeConversationIdRef\.current === \(conversationId \|\| startedConversationId\)/,
  );
});

test('background success notice is conditional and never the only delivery path', () => {
  assert.match(chatSource, /shouldShowBackgroundReplyNotice\(\{/);
  assert.match(chatSource, /applyAssistantPatch\(\{[\s\S]*?status: 'completed'/);
  assert.match(chatSource, /text: streamFinal\.text/);
  const noticeBlocks = [...chatSource.matchAll(/shouldShowBackgroundReplyNotice\([\s\S]*?setBackgroundNotification\(/g)];
  assert.ok(noticeBlocks.length >= 1, 'background notice is gated by shouldShowBackgroundReplyNotice');
  assert.equal(
    (chatSource.match(/setBackgroundNotification\(\{ conversationId, title:/g) || []).length,
    noticeBlocks.length,
    'every success banner uses the ownership gate',
  );
});

test('empty completed assistant placeholders are not rendered as blank black blocks', () => {
  assert.match(chatSource, /isPendingAssistant/);
  assert.match(chatSource, /if \(isPendingAssistant && !isSending\) \{/);
});

test('message keys prefer stable message ids', () => {
  assert.match(chatSource, /key=\{message\.id \|\| `\$\{message\.role\}-\$\{index\}`\}/);
});
