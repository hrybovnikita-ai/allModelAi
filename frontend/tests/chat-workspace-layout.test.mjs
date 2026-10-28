import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('chat workspace layout uses grid composer and centered conversation column', async () => {
  const css = await readFile(
    new URL('../src/components/Chat/ChatWorkspaceLayout.css', import.meta.url),
    'utf8',
  );
  const jsx = await readFile(
    new URL('../src/components/Chat/Chat.jsx', import.meta.url),
    'utf8',
  );
  const apiCss = await readFile(
    new URL('../src/components/Chat/ChatApi.css', import.meta.url),
    'utf8',
  );

  assert.match(css, /--chat-content-max-width:\s*1120px/);
  assert.match(css, /--chat-header-height:\s*68px/);
  assert.match(css, /chat-conversation-column/);
  assert.match(css, /position:\s*relative\s*!important/);
  assert.match(css, /chat-header-toolbar/);
  assert.match(jsx, /chat-header-toolbar/);
  assert.match(jsx, /chat-conversation-column/);
  assert.match(jsx, /chat-main/);
  assert.match(jsx, /chat-composer-container/);
  assert.match(jsx, /ChatWorkspaceLayout\.css/);
  assert.doesNotMatch(apiCss, /position:fixed!important[\s\S]*chat-composer/);

  const emptyJsx = await readFile(
    new URL('../src/components/Chat/ChatEmptyState.jsx', import.meta.url),
    'utf8',
  );
  const responsiveCss = await readFile(
    new URL('../src/styles/chat-responsive.css', import.meta.url),
    'utf8',
  );

  assert.match(emptyJsx, /chat-welcome-container/);
  assert.match(emptyJsx, /chat-welcome-content/);
  assert.match(css, /--chat-welcome-max-width:\s*960px/);
  assert.match(css, /chat-welcome-container/);
  assert.doesNotMatch(responsiveCss, /\.chat-messages[\s\S]*!important/);
});
