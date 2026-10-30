import { spawnSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const testsDir = join(root, 'tests');
const manifest = JSON.parse(
  readFileSync(join(root, '..', 'qa', 'critical-frontend.tests.json'), 'utf8'),
);

const renderTests = new Set([
  'session-contract-render.test.mjs',
  'settings-page-render.test.mjs',
]);

const staticFiles = [];
const renderFiles = [];

for (const name of manifest.files) {
  const full = join(testsDir, name);
  if (renderTests.has(name)) renderFiles.push(full);
  else staticFiles.push(full);
}

const reportDir = join(root, '..', 'qa-reports');
const reportPath = join(reportDir, 'frontend-critical.json');
const totalFiles = staticFiles.length + renderFiles.length;
let failed = false;

const staticRun = spawnSync(process.execPath, ['--test', ...staticFiles], {
  cwd: root,
  stdio: 'inherit',
});
if (staticRun.status !== 0) failed = true;

if (!failed && renderFiles.length) {
  const loaderUrl = pathToFileURL(join(root, 'scripts/register-test-loader.mjs')).href;
  const renderRun = spawnSync(
    process.execPath,
    ['--import', loaderUrl, '--import', 'tsx', '--test', ...renderFiles],
    { cwd: root, stdio: 'inherit' },
  );
  if (renderRun.status !== 0) failed = true;
}

try {
  mkdirSync(reportDir, { recursive: true });
  writeFileSync(
    reportPath,
    `${JSON.stringify({
      total: totalFiles,
      passed: failed ? Math.max(0, totalFiles - 1) : totalFiles,
      failed: failed ? 1 : 0,
      skipped: 0,
      status: failed ? 'failed' : 'passed',
      failureLabels: failed ? ['see test output'] : [],
    })}\n`,
    'utf8',
  );
} catch {
  // non-fatal
}

process.exit(failed ? 1 : 0);
