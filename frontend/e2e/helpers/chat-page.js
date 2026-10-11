/** @param {import('@playwright/test').Page} page */
export async function prepareAuthenticatedChatPage(page) {
  const testUser = { email: 'e2e-sidebar@test.local', name: 'E2E Sidebar' };

  await page.addInitScript((user) => {
    window.localStorage.setItem('allmodelai_user', JSON.stringify(user));
    window.localStorage.setItem('allmodelai_cookie_consent', 'accepted');
  }, testUser);

  await page.route('**/api/auth/session**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user: testUser, sessionVerified: true }),
    });
  });

  await page.route('**/api/credits**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        email: testUser.email,
        mode: 'user',
        models: ['smart', 'gemini', 'gpt'],
        canUseDeveloper: false,
        hasSubscription: false,
      }),
    });
  });

  await page.route('**/api/chat/history**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });

  await page.route('**/api/models/status**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ models: {}, providers: {} }),
    });
  });
}

/** @param {import('@playwright/test').Page} page */
export async function dismissCookieBanner(page) {
  const accept = page.getByRole('button', { name: 'Accept' });
  if (await accept.isVisible({ timeout: 2000 }).catch(() => false)) {
    await accept.click();
  }
}
