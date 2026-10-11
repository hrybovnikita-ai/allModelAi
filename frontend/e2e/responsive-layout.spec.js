import { test, expect } from '@playwright/test';

const VIEWPORTS = [
  { width: 320, height: 568, name: '320x568' },
  { width: 375, height: 667, name: '375x667' },
  { width: 390, height: 844, name: '390x844' },
  { width: 440, height: 956, name: '440x956' },
  { width: 768, height: 1024, name: '768x1024' },
  { width: 820, height: 1180, name: '820x1180' },
  { width: 1024, height: 768, name: '1024x768' },
  { width: 1280, height: 800, name: '1280x800' },
  { width: 1440, height: 900, name: '1440x900' },
  { width: 1920, height: 1080, name: '1920x1080' },
  { width: 2560, height: 1440, name: '2560x1440' },
];

async function assertNoHorizontalOverflow(page, label) {
  const result = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    pageWidth: document.documentElement.scrollWidth,
  }));
  expect(
    result.pageWidth,
    `${label}: scrollWidth ${result.pageWidth} vs clientWidth ${result.viewport}`,
  ).toBeLessThanOrEqual(result.viewport + 1);
}

test.describe('responsive layout overflow', () => {
  for (const viewport of VIEWPORTS) {
    test(`home ${viewport.name} has no horizontal overflow`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/', { waitUntil: 'networkidle' });
      await assertNoHorizontalOverflow(page, `home ${viewport.name}`);
    });

    test(`chat ${viewport.name} has no horizontal overflow`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/chat', { waitUntil: 'networkidle' });
      await assertNoHorizontalOverflow(page, `chat ${viewport.name}`);
      if (viewport.width <= 767) {
        const toggle = page.locator('.sidebar-toggle');
        if (await toggle.count()) {
          await expect(toggle.first()).toBeVisible();
        }
        const accessSwitch = page.locator('.access-mode-switch');
        if (await accessSwitch.count()) {
          const box = await accessSwitch.first().boundingBox();
          expect(box).toBeTruthy();
          expect(box.x).toBeGreaterThanOrEqual(-1);
          expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
        }
      }
    });
  }
});
