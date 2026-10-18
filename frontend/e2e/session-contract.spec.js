import { test, expect } from '@playwright/test';

const user = { id: 1, email: 'session-e2e@example.com', name: 'Session Test' };
async function setup(page, initialValid) {
  const state = { valid: initialValid, logoutCalls: 0, sessionCalls: 0 };
  await page.addInitScript(user => {
    localStorage.setItem('allmodelai_user', JSON.stringify(user));
    localStorage.setItem('allmodelai_cookie_consent', 'accepted');
  }, user);
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/logout') {
      state.logoutCalls++;
      state.valid = false;
      return route.fulfill({ status: 204 });
    }
    if (path === '/api/auth/session') {
      state.sessionCalls++;
      return route.fulfill({ json: { user: state.valid ? user : null, authenticated: state.valid } });
    }
    if (path === '/api/public/firebase-config') return route.fulfill({ json: { configured: false } });
    return route.fulfill({ json: {} });
  });
  // No real identity provider or user account is used by these regressions.
  await page.route('**/identitytoolkit.googleapis.com/**', route => route.abort());
  return state;
}

test('cached profile cannot expose signed-in navigation or dashboard', async ({ page }) => {
  await setup(page, false);
  await page.goto('/');
  await expect(page.locator('.nav-signin')).toBeVisible();
  await expect(page.locator('.nav-signout')).toHaveCount(0);
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login/);
});

test('verified navigation logs out on server, returns home, and stays signed out on reload', async ({ page }) => {
  const state = await setup(page, true);
  await page.goto('/');
  await expect(page.locator('.nav-user-dashboard')).toBeVisible();
  await page.locator('.nav-signout').click();
  await expect.poll(() => state.logoutCalls).toBe(1);
  await expect(page.locator('.nav-signin')).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await page.reload();
  await expect(page.locator('.nav-signin')).toBeVisible();
  await expect(page.locator('.nav-signout')).toHaveCount(0);
});

test('Dashboard click revalidates and rejects a session that expired after header rendering', async ({ page }) => {
  const state = await setup(page, true);
  await page.goto('/');
  await expect(page.locator('.nav-user-dashboard')).toBeVisible();
  const checks = state.sessionCalls;
  state.valid = false;
  await page.locator('.nav-user-dashboard').click();
  await expect(page).toHaveURL(/\/login/);
  expect(state.sessionCalls).toBeGreaterThan(checks);
});

test('Dashboard click keeps a valid backend session on /dashboard', async ({ page }) => {
  const state = await setup(page, true);
  await page.goto('/');
  await expect(page.locator('.nav-user-dashboard')).toBeVisible();
  const checks = state.sessionCalls;
  await page.locator('.nav-user-dashboard').click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect.poll(() => state.sessionCalls).toBeGreaterThan(checks);
  await expect(page.locator('.authenticated-shell')).toBeVisible();
});
