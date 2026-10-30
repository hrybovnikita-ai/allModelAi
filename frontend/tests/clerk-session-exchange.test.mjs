import assert from 'node:assert/strict';
import test from 'node:test';
import { isPermanentClerkExchangeFailure } from '../src/lib/clerkSessionExchange.js';

test('clerk exchange maps link-required conflicts to a safe message', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: false,
    status: 409,
    headers: { get: () => 'application/json' },
    text: async () => JSON.stringify({ code: 'CLERK_LINK_REQUIRED', message: 'server message' }),
  });
  try {
    const { exchangeClerkSessionForAllModelAI } = await import('../src/lib/clerkSessionExchange.js');
    await assert.rejects(
      () => exchangeClerkSessionForAllModelAI(async () => 'token', { rememberMe: true }),
      (error) => error.code === 'CLERK_LINK_REQUIRED' && /Connected accounts/i.test(error.message),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('409 clerk conflicts are permanent and must not be retried', () => {
  assert.equal(isPermanentClerkExchangeFailure({ status: 409, code: 'CLERK_LINK_REQUIRED' }), true);
  assert.equal(isPermanentClerkExchangeFailure({ status: 409, code: 'CLERK_IDENTITY_CONFLICT' }), true);
  assert.equal(isPermanentClerkExchangeFailure({ status: 500, code: 'CLERK_ACCOUNT_FAILED' }), false);
  assert.equal(isPermanentClerkExchangeFailure({ status: 503 }), false);
});
