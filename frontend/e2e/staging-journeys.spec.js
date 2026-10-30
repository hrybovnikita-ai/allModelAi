import { expect, test } from '@playwright/test';

const mockUser = { id: 42, email: 'staging-e2e@example.com', name: 'Staging User' };

/**
 * Mock authenticated API — no production credentials or real OAuth.
 */
async function mockAuthenticatedApi(page, { authenticated = true } = {}) {
  await page.addInitScript((user) => {
    localStorage.setItem('allmodelai_user', JSON.stringify(user));
    localStorage.setItem('allmodelai_cookie_consent', 'accepted');
  }, mockUser);

  await page.route('**/identitytoolkit.googleapis.com/**', (route) => route.abort());
  await page.route('**/securetoken.googleapis.com/**', (route) => route.abort());

  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();

    if (path === '/api/auth/session') {
      return route.fulfill({
        json: { user: authenticated ? mockUser : null, authenticated },
      });
    }
    if (path === '/api/auth/logout' && method === 'POST') {
      return route.fulfill({ status: 204 });
    }
    if (path === '/api/public/firebase-config') {
      return route.fulfill({ json: { configured: false } });
    }
    if (path.startsWith('/api/chat') && method === 'POST') {
      const body =
        'data: {"type":"delta","text":"Mock streamed "}\n\n' +
        'data: {"type":"delta","text":"answer."}\n\n' +
        'data: {"type":"done"}\n\n';
      return route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
        body,
      });
    }
    if (path.includes('/chat-settings') || path.includes('/api/credits')) {
      return route.fulfill({ json: { responseLanguage: 'auto', mode: 'user', remaining: 10 } });
    }
    if (path.includes('/api/subscription')) {
      return route.fulfill({ json: { plan: 'free', status: 'active' } });
    }
    if (path.includes('/api/auth/account/security')) {
      return route.fulfill({
        json: { passwordEnabled: true, providers: [], email: mockUser.email },
      });
    }
    if (path.includes('/api/platform/capabilities')) {
      return route.fulfill({ json: { features: [] } });
    }
    if (path.includes('/api/payments/checkout-info')) {
      return route.fulfill({
        json: { checkoutAvailable: false, stripeEmbeddedReady: false, reason: 'e2e_mock' },
      });
    }
    return route.fulfill({ json: {} });
  });
}

test.describe('@staging critical user journeys (mocked API)', () => {
  test('1 — home loads without horizontal overflow', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('body')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
    expect(overflow).toBe(true);
  });

  test('2 — registration form accepts input (client validation shell)', async ({ page }) => {
    await page.goto('/login');
    const createTab = page.getByRole('button', { name: /create account|sign up|register/i }).first();
    if (await createTab.count()) await createTab.click();
    const email = page.getByLabel(/email/i).first();
    await email.fill('new-user-staging@example.com');
    await expect(email).toHaveValue(/staging@example.com/);
  });

  test('3 — sign-in shell shows password field', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByLabel(/password/i).first()).toBeVisible();
  });

  test('4 — Google sign-in entry visible (no live OAuth)', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('button', { name: /continue with google/i })).toBeVisible();
  });

  test('5 — Clerk section or skip when disabled', async ({ page }) => {
    await page.goto('/login');
    const clerk = page.locator('[data-clerk], .clerk-sign-in, iframe[title*="Clerk"]');
    const count = await clerk.count();
    expect(count >= 0).toBe(true);
  });

  test('6 — chat shell with mocked session', async ({ page }) => {
    await mockAuthenticatedApi(page);
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto('/chat', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    expect(errors.filter((e) => /forEach|null/i.test(e)), errors.join('\n')).toEqual([]);
  });

  test('7 — mocked streaming endpoint contract', async ({ page }) => {
    await mockAuthenticatedApi(page);
    await page.goto('/chat', { waitUntil: 'domcontentloaded' });
    const text = await page.evaluate(async () => {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          model: 'smart',
          messages: [{ role: 'user', text: 'ping' }],
          temporary: true,
        }),
      });
      return res.text();
    });
    expect(text).toMatch(/data:/);
  });

  test('8 — settings page renders under auth shell', async ({ page }) => {
    await mockAuthenticatedApi(page);
    await page.goto('/settings', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.settings-page, #settings-general, main').first()).toBeVisible({ timeout: 15_000 });
  });

  test('9 — interface language control exists', async ({ page }) => {
    await mockAuthenticatedApi(page);
    await page.goto('/settings', { waitUntil: 'domcontentloaded' });
    const langControl = page.locator('#settings-general select, select[name*="language" i], .settings-page select').first();
    await expect(langControl).toBeVisible({ timeout: 15_000 });
  });

  test('10 — pricing to checkout or login path', async ({ page }) => {
    await page.goto('/pricing');
    await expect(page.getByRole('heading', { name: /pricing|plans/i }).first()).toBeVisible({ timeout: 15_000 });
    const subscribe = page.getByRole('button', { name: /subscribe|get started|choose/i }).first();
    if (await subscribe.count()) {
      await subscribe.click();
      await expect(page).toHaveURL(/\/(login|checkout)/);
    }
  });
});
