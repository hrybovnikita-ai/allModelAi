import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { navigateAfterSocialLogin } from '../src/lib/socialSignIn.js';

afterEach(() => {
  delete globalThis.window;
});

test('hosted production web uses SPA navigation to dashboard after Google login', () => {
  globalThis.window = {
    location: {
      protocol: 'https:',
      hostname: 'all-model-ai.com',
      origin: 'https://all-model-ai.com',
      port: '',
      replace: () => {
        throw new Error('hard navigation should not run on hosted web');
      },
    },
  };

  let target = null;
  navigateAfterSocialLogin(
    { email: 'user@example.com', name: 'User' },
    { navigate: (path) => { target = path; } },
  );
  assert.equal(target, '/dashboard');
});
