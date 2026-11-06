import { test as base, expect } from '@playwright/test';
import { dismissCookieBanner, prepareAuthenticatedChatPage } from '../helpers/chat-page.js';

/**
 * Signed-in chat page without live API keys.
 * Specific routes in prepareAuthenticatedChatPage override the empty API fallback.
 */
export const test = base.extend({
  authedPage: async ({ page }, provide) => {
    await page.route('**/api/**', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{}',
    }));
    await prepareAuthenticatedChatPage(page);
    await provide(page);
  },
});

export { expect, dismissCookieBanner };
