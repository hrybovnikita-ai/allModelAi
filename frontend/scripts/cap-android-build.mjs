import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const androidRoot = path.join(root, 'android');
const isWin = process.platform === 'win32';
const gradlew = path.join(androidRoot, isWin ? 'gradlew.bat' : 'gradlew');

const result = spawnSync(
  gradlew,
  ['assembleRelease'],
  {
    cwd: androidRoot,
    stdio: 'inherit',
    shell: isWin,
  },
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log('\nAndroid release APK/AAB output: android/app/build/outputs/\n');
