import { dismissCookieBanner, expect, test } from './fixtures/auth.js';

const WIDTHS = [320, 375, 393, 440, 768, 820, 1024, 1180, 1280, 1440, 1920];

test.describe('dashboard responsive layout', () => {
  for (const width of WIDTHS) {
    test(`${width}px`, async ({ authedPage: page }) => {
      await page.setViewportSize({ width, height: width < 768 ? 800 : 1000 });
      await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
      await dismissCookieBanner(page);
      await page.locator('.dashboard-page').waitFor({ state: 'visible', timeout: 20_000 });
      const overflow = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        pageWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      }));
      expect(overflow.pageWidth, `${width}px overflow`).toBeLessThanOrEqual(overflow.viewport + 1);
      await expect(page.locator('.dashboard-hero').first()).toBeVisible();
      await expect(page.locator('.dashboard-quick-actions').first()).toBeVisible();
    });
  }
});
