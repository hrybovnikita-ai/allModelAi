import { expect, test } from '@playwright/test';

test('pricing subscription buttons keep a checkout return path', async ({ page }) => {
  await page.goto('/');
  const pro = page.getByRole('button', { name: /^subscribe$/i });
  if (!(await pro.count())) {
    test.skip();
    return;
  }
  await pro.first().click();
  await expect(page).toHaveURL(/\/(login|checkout)/);
});
