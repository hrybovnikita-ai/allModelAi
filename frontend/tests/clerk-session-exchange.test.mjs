import assert from 'node:assert/strict';
import test from 'node:test';

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
      (error) => error.code === 'CLERK_LINK_REQUIRED' && /existing method/i.test(error.message),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
