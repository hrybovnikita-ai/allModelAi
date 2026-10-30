import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const testsDir = join(root, 'tests');
const renderTests = new Set([
  'auth-transition-render.test.mjs',
  'session-contract-render.test.mjs',
  'confirm-dialog-render.test.mjs',
  'user-memory-settings-render.test.mjs',
  'settings-page-render.test.mjs',
]);
/** Skipped in CI — high memory / long runtime; covered by critical subset + manual staging. */
const ciHeavyTests = new Set(['chat-compatibility.test.mjs', 'everyday-ai.test.mjs']);
const skipHeavy = process.env.CI === 'true' && process.env.CI_RUN_HEAVY_FRONTEND_TESTS !== 'true';

const staticTests = readdirSync(testsDir)
  .filter((name) => name.endsWith('.test.mjs') && !renderTests.has(name))
  .filter((name) => !(skipHeavy && ciHeavyTests.has(name)))
  .map((name) => join(testsDir, name));

const staticRun = spawnSync(process.execPath, ['--test', ...staticTests], {
  cwd: root,
  stdio: 'inherit',
});
if (staticRun.status !== 0) process.exit(staticRun.status ?? 1);

const loaderUrl = pathToFileURL(join(root, 'scripts/register-test-loader.mjs')).href;
const renderRun = spawnSync(
  process.execPath,
  [
    '--import',
    loaderUrl,
    '--import',
    'tsx',
    '--test',
    ...[...renderTests].map((name) => join(testsDir, name)),
  ],
  { cwd: root, stdio: 'inherit' },
);
process.exit(renderRun.status ?? 1);
