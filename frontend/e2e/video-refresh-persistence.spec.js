import { test, expect } from '@playwright/test';
import { dismissCookieBanner, prepareAuthenticatedChatPage } from './helpers/chat-page.js';

const conversationId = 'e2e-video-conv';
const jobId = 'vjob-e2e-refresh';
const videoStream = `/api/video/jobs/${jobId}/stream`;

const historyPayload = [
  {
    id: conversationId,
    email: 'e2e-sidebar@test.local',
    model: 'gpt',
    title: 'Golden dragon video',
    messages: [
      { role: 'user', text: 'Golden dragon prompt' },
      {
        role: 'assistant',
        text: 'Done! Here is your video.',
        videoJobId: jobId,
        videoUrl: videoStream,
        videoAttachment: {
          version: 1,
          id: `vatt-${jobId}`,
          videoJobId: jobId,
          playbackUrl: videoStream,
          status: 'completed',
          model: 'ltx-2.5',
          resolution: '480p',
          aspectRatio: '16:9',
        },
      },
    ],
  },
];

test.describe('video chat persistence after reload', () => {
  test.beforeEach(async ({ page }) => {
    await prepareAuthenticatedChatPage(page);
    await page.unroute('**/api/chat/history**');
    await page.route('**/api/chat/history**', async (route) => {
      if (route.request().method() !== 'GET') {
        return route.continue();
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(historyPayload),
      });
    });

    await page.route(`**${videoStream}`, async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'video/mp4',
        body: Buffer.from('fake-mp4-bytes'),
      });
    });
  });

  test('keeps generated video card across five reloads', async ({ page }) => {
    await page.goto(`/chat?conversation=${conversationId}`);
    await dismissCookieBanner(page);
    for (let reload = 0; reload < 5; reload += 1) {
      await expect(page.getByText('Done! Here is your video.')).toBeVisible({ timeout: 15000 });
      await expect(page.getByLabel('Generated video')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Download video' })).toBeVisible();
      await page.reload();
    }
  });
});
