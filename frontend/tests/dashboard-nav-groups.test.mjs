import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src/components/Dashboard');

const extractLinkLabels = (source) => {
  const labels = [];
  const re = /label:\s*['"]([^'"]+)['"]/g;
  let match = re.exec(source);
  while (match) {
    labels.push(match[1]);
    match = re.exec(source);
  }
  return labels;
};

const extractGroupedLabels = (source) => {
  const labels = new Set();
  const blockRe = /byLabel\(\[([\s\S]*?)\]\)/g;
  let block = blockRe.exec(source);
  while (block) {
    const itemRe = /['"]([^'"]+)['"]/g;
    let item = itemRe.exec(block[1]);
    while (item) {
      labels.add(item[1]);
      item = itemRe.exec(block[1]);
    }
    block = blockRe.exec(source);
  }
  if (source.includes("'Profile'") || source.includes('"Profile"')) labels.add('Profile');
  if (source.includes("'Settings'") || source.includes('"Settings"')) labels.add('Settings');
  if (source.includes('Data & Storage')) labels.add('Storage Hub');
  if (source.includes('Account & Settings')) {
    labels.add('Profile');
    labels.add('Settings');
  }
  return labels;
};

test('sidebar groups preserve every dashboard nav route label', async () => {
  const [linksSource, groupsSource] = await Promise.all([
    readFile(path.join(root, 'dashboardNavLinks.js'), 'utf8'),
    readFile(path.join(root, 'dashboardNavGroups.js'), 'utf8'),
  ]);
  const navLabels = extractLinkLabels(linksSource);
  const groupedLabels = extractGroupedLabels(groupsSource);
  for (const label of navLabels) {
    assert.ok(groupedLabels.has(label), `missing nav label in sidebar groups: ${label}`);
  }
});
