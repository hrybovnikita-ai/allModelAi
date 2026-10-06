import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { collectAuthDiagnostics, formatAuthDiagnosticsReport } from '../src/lib/authDebugPanel.js';

test('auth diagnostics never include token or cookie fields', () => {
  const report = formatAuthDiagnosticsReport(collectAuthDiagnostics({ status: 'anonymous', user: null }));
  assert.doesNotMatch(report, /token|password|authorization|apikey|Bearer/i);
  assert.match(report, /origin:/);
  assert.match(report, /firebaseAuthDomain:/);
});

test('AuthDebugPanel source does not render secrets', async () => {
  const source = await readFile(new URL('../src/components/SocialAuth/AuthDebugPanel.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /idToken|allmodelai_session|Authorization/i);
});
