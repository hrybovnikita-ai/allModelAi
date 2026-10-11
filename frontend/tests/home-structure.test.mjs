import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appSource = fs.readFileSync(path.join(frontendRoot, 'src/App.jsx'), 'utf8');
const refinementCss = fs.readFileSync(
  path.join(frontendRoot, 'src/styles/home-visual-refinement.css'),
  'utf8',
);
const designSystem = fs.readFileSync(
  path.join(frontendRoot, 'src/styles/design-system.css'),
  'utf8',
);

test('homepage preserves section order and components', () => {
  const headerIdx = appSource.indexOf('<Header />');
  const modelsIdx = appSource.indexOf('<ModelsSection');
  const rainbowIdx = appSource.indexOf('<RainbowExperience />');
  const everydayIdx = appSource.indexOf('<EverydayCards />');
  const aboutIdx = appSource.indexOf('<About />');
  const workflowIdx = appSource.indexOf('<Workflow />');
  const usersIdx = appSource.indexOf('<Users />');
  const stickersIdx = appSource.indexOf('<Stickers />');
  const pricingIdx = appSource.indexOf('<Pricing />');
  const footerIdx = appSource.indexOf('<Footer />');

  assert.ok(headerIdx >= 0);
  assert.ok(modelsIdx > headerIdx);
  assert.ok(rainbowIdx > modelsIdx);
  assert.ok(everydayIdx > rainbowIdx);
  assert.ok(aboutIdx > everydayIdx);
  assert.ok(workflowIdx > aboutIdx);
  assert.ok(usersIdx > workflowIdx);
  assert.ok(stickersIdx > usersIdx);
  assert.ok(pricingIdx > stickersIdx);
  assert.ok(footerIdx > pricingIdx);
});

test('visual refinement stylesheet avoids new hex palette tokens', () => {
  assert.doesNotMatch(refinementCss, /#[0-9a-fA-F]{3,8}\s*;/);
  assert.match(refinementCss, /var\(--/);
  assert.match(refinementCss, /prefers-reduced-motion/);
});

test('design-system color tokens unchanged by refinement import', () => {
  assert.match(designSystem, /--primary:/);
  assert.match(designSystem, /--bg-primary:/);
});
