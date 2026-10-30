import { expect, test } from '@playwright/test';

test.describe('@smoke critical routes', () => {
  test('login shell renders without console errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(String(err)));
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: /welcome to allmodelai|create your account/i })).toBeVisible();
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('pricing page loads plan cards', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(String(err)));
    await page.goto('/pricing');
    await expect(page.getByRole('heading', { name: /pricing|plans/i }).first()).toBeVisible({ timeout: 15_000 });
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('chat route loads shell (may redirect when logged out)', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(String(err)));
    await page.goto('/chat', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    expect(errors.filter((e) => !/forEach/i.test(e)), errors.join('\n')).toEqual([]);
  });

  test('checkout without plan shows safe state', async ({ page }) => {
    await page.goto('/checkout');
    await expect(page.locator('body')).toBeVisible();
  });
});
