#!/usr/bin/env node
/**
 * Writes backend/data/qa-last-run.json from environment variables set in CI
 * or from simple JSON files dropped in qa-reports/.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const outPath = join(repoRoot, 'backend', 'data', 'qa-last-run.json');

function readJsonIfExists(path) {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8'));
}

const backend = readJsonIfExists(join(repoRoot, 'qa-reports', 'backend-critical.json'));
const frontend = readJsonIfExists(join(repoRoot, 'qa-reports', 'frontend-critical.json'));
const playwright = readJsonIfExists(join(repoRoot, 'qa-reports', 'playwright-smoke.json'));

const payload = {
  recordedAt: new Date().toISOString(),
  source: process.env.GITHUB_ACTIONS ? 'github-actions' : 'local',
  commit: process.env.GITHUB_SHA || null,
  workflowRun: process.env.GITHUB_RUN_ID || null,
  buildStatus: process.env.QA_BUILD_STATUS || 'unknown',
  suites: {
    backendCritical: backend || { total: 0, passed: 0, failed: 0, skipped: 0, status: 'not_run' },
    frontendCritical: frontend || { total: 0, passed: 0, failed: 0, skipped: 0, status: 'not_run' },
    playwrightSmoke: playwright || { total: 0, passed: 0, failed: 0, skipped: 0, status: 'not_run' },
  },
  authentication: {
    status:
      (backend?.failed || 0) + (frontend?.failed || 0) > 0 ? 'failed' : backend && frontend ? 'passed' : 'partial',
    details: [
      'Clerk session exchange & CLERK_LINK_REQUIRED (409)',
      'Firebase email/password validation',
      'Registration & password reset stores',
      'Session cookies & access control',
    ],
  },
  failures: [
    ...(backend?.failureLabels || []),
    ...(frontend?.failureLabels || []),
    ...(playwright?.failureLabels || []),
  ].map((label) => ({ suite: 'critical', label })),
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
console.log(`Wrote ${outPath}`);
