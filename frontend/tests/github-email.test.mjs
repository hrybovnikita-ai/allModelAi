import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickGitHubSignInEmail } from '../src/lib/githubEmail.js';

test('pickGitHubSignInEmail prefers verified primary including noreply', () => {
  const email = pickGitHubSignInEmail([
    { email: 'user@company.com', verified: false, primary: true },
    { email: '12345+noreply@users.noreply.github.com', verified: true, primary: false },
    { email: 'backup@example.com', verified: true, primary: false },
  ]);
  assert.equal(email, '12345+noreply@users.noreply.github.com');
});

test('pickGitHubSignInEmail uses verified primary when present', () => {
  const email = pickGitHubSignInEmail([
    { email: 'primary@example.com', verified: true, primary: true },
    { email: 'other@example.com', verified: true, primary: false },
  ]);
  assert.equal(email, 'primary@example.com');
});

test('pickGitHubSignInEmail returns null when no verified email exists', () => {
  assert.equal(pickGitHubSignInEmail([{ email: 'a@b.com', verified: false, primary: true }]), null);
});
