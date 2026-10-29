import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertAllModelAiVercelRewrites,
  assertExternalProxyPathSyntax,
} from './vercel-rewrite-helpers.mjs';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(frontendRoot, '..');
const frontendConfig = JSON.parse(fs.readFileSync(path.join(frontendRoot, 'vercel.json'), 'utf8'));
const rootConfig = JSON.parse(fs.readFileSync(path.join(repoRoot, 'vercel.json'), 'utf8'));

test('frontend vercel.json proxies Firebase /__/auth before SPA catch-all', () => {
  assertAllModelAiVercelRewrites(frontendConfig, 'frontend');
});

test('root vercel.json matches frontend Firebase and API rewrite rules', () => {
  assertAllModelAiVercelRewrites(rootConfig, 'root');
  assert.deepEqual(
    rootConfig.rewrites.map(({ source, destination }) => ({ source, destination })),
    frontendConfig.rewrites.map(({ source, destination }) => ({ source, destination })),
  );
});

test('frontend vercel.json uses :path* syntax for external proxies', () => {
  assertExternalProxyPathSyntax(frontendConfig);
});
