import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAssistantVideoMessage,
  messageHasPlayableVideo,
  normalizeConversationMessages,
  normalizeVideoMessage,
} from '../src/lib/chatMessageVideo.js';

test('normalizeVideoMessage restores playback URL from attachment', () => {
  const message = normalizeVideoMessage({
    role: 'assistant',
    text: 'Done! Here is your video.',
    videoAttachment: {
      version: 1,
      videoJobId: 'vjob-1',
      playbackUrl: '/api/video/jobs/vjob-1/stream',
      status: 'completed',
    },
  });
  assert.equal(message.videoUrl, '/api/video/jobs/vjob-1/stream');
  assert.equal(message.videoJobId, 'vjob-1');
  assert.equal(messageHasPlayableVideo(message), true);
});

test('buildAssistantVideoMessage includes attachment and flat fields', () => {
  const message = buildAssistantVideoMessage({
    jobId: 'vjob-abc',
    videoUrl: '/api/video/jobs/vjob-abc/stream',
    model: 'ltx-2.5',
    aspectRatio: '16:9',
    resolution: '480p',
    mimeType: 'video/mp4',
  });
  assert.equal(message.videoJobId, 'vjob-abc');
  assert.equal(message.videoAttachment.videoJobId, 'vjob-abc');
});

test('normalizeConversationMessages applies to every message', () => {
  const messages = normalizeConversationMessages([
    { role: 'user', text: 'prompt' },
    {
      role: 'assistant',
      text: 'Done! Here is your video.',
      videoAttachment: {
        version: 1,
        playbackUrl: '/api/video/jobs/vjob-x/stream',
        videoJobId: 'vjob-x',
        status: 'completed',
      },
    },
  ]);
  assert.equal(messages[1].videoUrl, '/api/video/jobs/vjob-x/stream');
});
