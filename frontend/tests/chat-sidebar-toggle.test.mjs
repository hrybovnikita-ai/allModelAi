import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('Chat exposes single sidebar state with toggle and a11y attributes', async () => {
  const chat = await readFile(new URL('../src/components/Chat/Chat.jsx', import.meta.url), 'utf8');
  assert.match(chat, /const \[sidebarOpen, setSidebarOpen\]/);
  assert.match(chat, /toggleSidebar/);
  assert.match(chat, /closeSidebar/);
  assert.match(chat, /aria-expanded=\{sidebarOpen\}/);
  assert.match(chat, /aria-controls=\{CHAT_SIDEBAR_DRAWER_ID\}/);
  assert.match(chat, /event\.key !== 'Escape'/);
});

test('ChatSidebar drawer has id and mobile close hooks', async () => {
  const sidebar = await readFile(new URL('../src/components/Chat/ChatSidebar.jsx', import.meta.url), 'utf8');
  assert.match(sidebar, /id=\{sidebarDrawerId\}/);
  assert.match(sidebar, /closeMobileSidebar/);
});
