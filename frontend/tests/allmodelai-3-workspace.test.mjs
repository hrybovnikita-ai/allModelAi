import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('main imports AllModelAI 3.0 workspace styles', async () => {
  const main = await readFile(path.join(root, 'src/main.jsx'), 'utf8');
  assert.match(main, /allmodelai-3-workspace\.css/);
});

test('workspace CSS guards overflow and send button', async () => {
  const css = await readFile(path.join(root, 'src/styles/allmodelai-3-workspace.css'), 'utf8');
  assert.match(css, /overflow-x: clip/);
  assert.match(css, /\.send-message/);
  assert.match(css, /prefers-reduced-motion/);
});

test('dashboard usage chart uses byModel only', async () => {
  const chart = await readFile(path.join(root, 'src/components/Dashboard/DashboardUsageChart.jsx'), 'utf8');
  assert.match(chart, /byModel/);
  assert.doesNotMatch(chart, /Math\.random/);
});
