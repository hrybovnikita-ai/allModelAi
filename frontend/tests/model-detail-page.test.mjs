import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  capabilityCardsForSlug,
  isModelAccessible,
  statusKeyForSlug,
  subscriptionLabelForModel,
} from '../src/data/modelCapabilitiesMeta.js';
import { promptGalleryForSlug } from '../src/data/modelPromptGallery.js';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dashboardModelsSource = fs.readFileSync(
  path.join(frontendRoot, 'src/data/dashboardModels.js'),
  'utf8',
);
const modelSlugs = [...dashboardModelsSource.matchAll(/slug:\s*'([^']+)'/g)].map((m) => m[1]);
const appSource = fs.readFileSync(path.join(frontendRoot, 'src/App.jsx'), 'utf8');
const modelDetailsSource = fs.readFileSync(path.join(frontendRoot, 'src/components/ModelDetails/ModelDetails.jsx'), 'utf8');
const heroSource = fs.readFileSync(path.join(frontendRoot, 'src/components/ModelDetails/ModelDetailHero.jsx'), 'utf8');
const promptSource = fs.readFileSync(path.join(frontendRoot, 'src/components/ModelDetails/ModelDetailPromptGallery.jsx'), 'utf8');

test('model detail route is registered for shared page', () => {
  assert.match(appSource, /path="\/models\/:slug"/);
  assert.match(modelDetailsSource, /ModelDetailHero/);
  assert.match(modelDetailsSource, /ModelDetailCapabilities/);
  assert.match(modelDetailsSource, /ModelDetailPromptGallery/);
});

test('every dashboard model slug has guide and prompt gallery', () => {
  assert.ok(modelSlugs.length >= 10);
  for (const slug of modelSlugs) {
    const prompts = promptGalleryForSlug(slug);
    assert.ok(prompts.length >= 1, `${slug} should have prompts`);
    assert.ok(prompts[0].prompt.length > 10, `${slug} primary prompt`);
  }
});

test('mistral exposes verified capability cards only', () => {
  const cards = capabilityCardsForSlug('mistral');
  assert.ok(cards.some((c) => c.label === 'Programming'));
  assert.ok(!cards.some((c) => c.label === 'Image understanding'));
});

test('unknown slug capability metadata returns empty list', () => {
  assert.deepEqual(capabilityCardsForSlug('not-a-real-model'), []);
});

test('subscription access respects credit status', () => {
  assert.equal(isModelAccessible('smart', null), true);
  assert.equal(isModelAccessible('gpt', { models: ['gemini'] }), false);
  assert.equal(isModelAccessible('gpt', { models: ['all'] }), true);
  assert.match(subscriptionLabelForModel({ slug: 'mistral', tier: 'economy' }, null), /Subscription/);
});

test('compare and try-in-chat behaviors are wired', () => {
  assert.match(heroSource, /Compare Models/);
  assert.match(heroSource, /Start Chat/);
  assert.match(promptSource, /starterPrompt/);
  assert.match(promptSource, /Copy Prompt/);
  assert.match(modelDetailsSource, /\/arena\?models=/);
});

test('unknown model shows not-found instead of silent redirect', () => {
  assert.match(modelDetailsSource, /Model not found/);
  assert.doesNotMatch(modelDetailsSource, /Navigate to="\/dashboard"/);
});

test('status key mapping covers direct providers', () => {
  assert.equal(statusKeyForSlug('mistral'), 'others');
  assert.equal(statusKeyForSlug('gpt'), 'gpt');
});
