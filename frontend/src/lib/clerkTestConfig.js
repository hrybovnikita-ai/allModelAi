/** Development-only Clerk test page. Never used for AllModelAI API authorization. */
export const CLERK_TEST_PATH = '/auth/clerk-test';

export function isClerkTestRouteEnabled() {
  return Boolean(import.meta.env?.DEV);
}

/**
 * True when a Clerk publishable key is configured. Does not return the key.
 */
export function isClerkPublishableKeyConfigured(env = import.meta.env || {}) {
  const value = String(env.VITE_CLERK_PUBLISHABLE_KEY || '').trim();
  return value.startsWith('pk_test_') || value.startsWith('pk_live_');
}

export function clerkPublishableKey(env = import.meta.env || {}) {
  const value = String(env.VITE_CLERK_PUBLISHABLE_KEY || '').trim();
  if (!value.startsWith('pk_test_') && !value.startsWith('pk_live_')) return '';
  return value;
}
