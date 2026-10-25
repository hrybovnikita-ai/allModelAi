import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveModelLibraryCardStatus } from '../src/lib/modelLibraryStatus.js';

test('gpt-oss-groq uses modelHealth setup_needed when Groq key missing', () => {
  const status = resolveModelLibraryCardStatus('gpt-oss-groq', { 'gpt-oss-groq': false }, {
    'gpt-oss-groq': { status: 'setup_needed' },
  });
  assert.equal(status.label, 'Setup needed');
});

test('gpt-oss-groq shows Available when live probe passed', () => {
  const status = resolveModelLibraryCardStatus('gpt-oss-groq', { 'gpt-oss-groq': true }, {
    'gpt-oss-groq': { status: 'available' },
  });
  assert.equal(status.label, 'Available');
});

test('gpt-oss-groq shows Configured when key present but probe not run yet', () => {
  const status = resolveModelLibraryCardStatus('gpt-oss-groq', { 'gpt-oss-groq': true }, {
    'gpt-oss-groq': { status: 'configured' },
  });
  assert.equal(status.label, 'Configured');
});
