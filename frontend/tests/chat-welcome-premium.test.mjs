import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const chatCss = path.join(root, 'src/components/Chat/Chat.css');
const welcomeCss = path.join(root, 'src/components/Chat/ChatWelcomeSuggestions.css');
const designTokens = path.join(root, 'src/styles/design-system.css');

function colorLiterals(source) {
  return [...source.matchAll(/#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\)/g)].map((m) => m[0]);
}

test('welcome suggestion cards keep equal-height grid and staggered enter animation', () => {
  const css = fs.readFileSync(welcomeCss, 'utf8');
  assert.match(css, /grid-template-columns:\s*repeat\(3/);
  assert.match(css, /translateY\(-4px\)/);
  assert.match(css, /welcome-card-enter/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});

test('chat brand wordmark uses bold italic without changing brand color tokens', () => {
  const sidebar = fs.readFileSync(path.join(root, 'src/components/Chat/ChatSidebar.css'), 'utf8');
  assert.match(sidebar, /\.chat-brand-compact strong[\s\S]*font-weight:\s*800/);
  assert.match(sidebar, /\.chat-brand-compact strong[\s\S]*font-style:\s*italic/);
  const tokens = fs.readFileSync(designTokens, 'utf8');
  assert.match(tokens, /--purple:\s*#7c5cff/);
  const chat = fs.readFileSync(chatCss, 'utf8');
  assert.match(chat, /--chat-accent:#7567f8/);
  assert.match(chat, /--chat-bg:#080d18/);
});

test('Chat welcome omits AI Workspace strip but module remains available', () => {
  const empty = fs.readFileSync(path.join(root, 'src/components/Chat/ChatEmptyState.jsx'), 'utf8');
  const workspace = fs.readFileSync(path.join(root, 'src/components/Chat/ChatAiWorkspace.jsx'), 'utf8');
  const chat = fs.readFileSync(path.join(root, 'src/components/Chat/Chat.jsx'), 'utf8');
  assert.doesNotMatch(empty, /ChatAiWorkspace/);
  assert.match(workspace, /\/api\/chat\/improve-prompt/);
  assert.match(workspace, /Continue Working/);
  assert.match(chat, /ChatEmptyState/);
  assert.match(chat, /ChatWelcomeSuggestions|chooseSuggestion/);
});

test('welcome card color literals are unchanged from monochrome card palette', () => {
  const css = fs.readFileSync(welcomeCss, 'utf8');
  const colors = new Set(colorLiterals(css));
  // Existing card palette must still be present (no retheme).
  assert.ok(colors.has('#18181d') || [...colors].some((c) => c.includes('#18181d')));
  assert.ok([...colors].some((c) => c.includes('#101014')));
  assert.ok([...colors].some((c) => c === '#fff' || c === '#ffffff'));
});
