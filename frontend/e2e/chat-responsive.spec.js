import { dismissCookieBanner, expect, test } from './fixtures/auth.js';

const WIDTHS = [320, 375, 393, 440, 768, 820, 1024, 1366, 1920];

const DEVICES = [
  { name: 'iphone-17-portrait', width: 402, height: 874 },
  { name: 'iphone-17-landscape', width: 874, height: 402 },
  { name: 'ipad-air-portrait', width: 820, height: 1180 },
  { name: 'ipad-air-landscape', width: 1180, height: 820 },
];

async function openChat(page, size) {
  await page.setViewportSize(size);
  await page.goto('/chat', { waitUntil: 'domcontentloaded' });
  await dismissCookieBanner(page);
  await page.locator('.chat-page').waitFor({ state: 'visible', timeout: 20_000 });
}

async function assertNoHorizontalOverflow(page, label) {
  const result = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    pageWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
  }));
  expect(result.pageWidth, `${label}: horizontal overflow`).toBeLessThanOrEqual(result.viewport + 1);
}

async function assertHeaderControls(page, label) {
  const boxes = await page.locator('.chat-header .sidebar-toggle, .chat-header .chat-header-action, .chat-header .model-select-trigger, .chat-header .access-mode-switch button').evaluateAll((nodes) => nodes
    .filter((node) => {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    })
    .map((node) => {
      const rect = node.getBoundingClientRect();
      return { x: rect.x, y: rect.y, w: rect.width, h: rect.height, label: node.getAttribute('aria-label') || node.textContent?.trim()?.slice(0, 24) || '' };
    }));
  const viewport = page.viewportSize();
  for (const box of boxes) {
    expect(box.x, `${label} clipped ${box.label}`).toBeGreaterThanOrEqual(-1);
    expect(box.x + box.w, `${label} clipped ${box.label}`).toBeLessThanOrEqual((viewport?.width || 0) + 1);
    expect(box.h, `${label} tiny control ${box.label}`).toBeGreaterThanOrEqual(28);
  }
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i];
      const b = boxes[j];
      const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      const overlap = overlapX > 8 && overlapY > 8;
      expect(overlap, `${label} overlap ${a.label} / ${b.label}`).toBeFalsy();
    }
  }
}

test.describe('chat responsive layout', () => {
  for (const width of WIDTHS) {
    test(`width ${width}`, async ({ authedPage: page }) => {
      const height = width < 768 ? 800 : 900;
      await openChat(page, { width, height });
      await assertNoHorizontalOverflow(page, `${width}px`);
      await assertHeaderControls(page, `${width}px`);
      await expect(page.locator('.chat-composer textarea').first()).toBeVisible();
      await expect(page.locator('.welcome-suggestion-card').first()).toBeVisible();
      await page.screenshot({
        path: `e2e/screenshots/chat-${width}.png`,
        fullPage: false,
      });
    });
  }

  for (const device of DEVICES) {
    test(device.name, async ({ authedPage: page }) => {
      await openChat(page, device);
      await assertNoHorizontalOverflow(page, device.name);
      await assertHeaderControls(page, device.name);
      await expect(page.locator('.chat-composer textarea').first()).toBeVisible();
      await page.screenshot({
        path: `e2e/screenshots/chat-${device.name}.png`,
        fullPage: false,
      });
    });
  }

  test('sidebar, model selector, welcome card, and composer', async ({ authedPage: page }) => {
    await openChat(page, { width: 393, height: 852 });
    const toggle = page.locator('.sidebar-toggle');
    await toggle.click();
    await expect(page.locator('#chat-sidebar-drawer')).toHaveClass(/open/);
    await toggle.click();
    await expect(page.locator('#chat-sidebar-drawer')).not.toHaveClass(/open/);

    await page.locator('.model-select-trigger').click();
    await expect(page.locator('.model-options')).toBeVisible();
    await page.keyboard.press('Escape');

    await page.locator('.welcome-suggestion-card').first().click();
    const input = page.locator('.chat-composer textarea').first();
    await expect(input).toBeVisible();
    await input.fill('Layout check');
    await expect(input).toHaveValue('Layout check');
    await assertNoHorizontalOverflow(page, 'after interactions');
  });
});
