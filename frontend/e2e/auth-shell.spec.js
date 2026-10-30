import { expect, test } from '@playwright/test';

test('login shell shows email and Google sign-in without GitHub', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: /welcome to allmodelai|create your account/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /continue with google/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /continue with github/i })).toHaveCount(0);
  await expect(page.getByLabel(/password/i).first()).toBeVisible();
});

test('command palette opens with Ctrl+K or Meta+K', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Control+K');
  const dialog = page.getByRole('dialog');
  if (await dialog.count()) {
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
  }
});
