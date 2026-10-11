import { test, expect } from '@playwright/test';
import { dismissCookieBanner, prepareAuthenticatedChatPage } from './helpers/chat-page.js';

const MOBILE_VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 440, height: 956 },
];

const DESKTOP_VIEWPORTS = [
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1920, height: 1080 },
];

test.describe('mobile sidebar hamburger toggle', () => {
  for (const viewport of MOBILE_VIEWPORTS) {
    test(`toggle open/close at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await prepareAuthenticatedChatPage(page);
      await page.setViewportSize(viewport);
      await page.goto('/chat', { waitUntil: 'networkidle' });
      await dismissCookieBanner(page);

      const toggle = page.locator('.sidebar-toggle');
      await expect(toggle).toBeVisible();
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');

      await toggle.click();
      const drawer = page.locator('#chat-sidebar-drawer');
      await expect(drawer).toHaveClass(/open/);
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');

      await toggle.click();
      await expect(drawer).not.toHaveClass(/open/);
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    });
  }

  test('overlay and Escape close the drawer', async ({ page }) => {
    await prepareAuthenticatedChatPage(page);
    await page.setViewportSize({ width: 440, height: 956 });
    await page.goto('/chat', { waitUntil: 'networkidle' });
    await dismissCookieBanner(page);

    const toggle = page.locator('.sidebar-toggle');
    await toggle.click();
    await expect(page.locator('#chat-sidebar-drawer')).toHaveClass(/open/);

    await page.locator('.sidebar-backdrop.visible').click();
    await expect(page.locator('#chat-sidebar-drawer')).not.toHaveClass(/open/);

    await toggle.click();
    await page.keyboard.press('Escape');
    await expect(page.locator('#chat-sidebar-drawer')).not.toHaveClass(/open/);
    await expect(toggle).toBeFocused();
  });
});

test.describe('desktop sidebar unaffected by mobile drawer state', () => {
  for (const viewport of DESKTOP_VIEWPORTS) {
    test(`chat layout at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await prepareAuthenticatedChatPage(page);
      await page.setViewportSize(viewport);
      await page.goto('/chat', { waitUntil: 'networkidle' });
      await dismissCookieBanner(page);
      const overflow = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        pageWidth: document.documentElement.scrollWidth,
      }));
      expect(overflow.pageWidth).toBeLessThanOrEqual(overflow.viewport + 1);
    });
  }
});
