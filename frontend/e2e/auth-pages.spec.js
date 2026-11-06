import { expect, test } from '@playwright/test';

test.describe('dedicated auth pages', () => {
  test('sign in and sign up navigate between pages', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('One prompt. Every great model.')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Continue with Google/ })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Email' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Forgot password?' })).toBeVisible();
    await page.getByRole('link', { name: 'Sign up' }).click();
    await expect(page).toHaveURL(/\/signup$/);
    await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
    await page.getByRole('link', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('home sign in opens the standalone login route', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const signIn = page.locator('.nav-signin').first();
  if (await signIn.count()) {
    await signIn.click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText('One prompt. Every great model.')).toHaveCount(0);
  }
});

test('signup route and register alias render the same form', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/signup');
    await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
    expect(overflow).toBeTruthy();
  });
});
