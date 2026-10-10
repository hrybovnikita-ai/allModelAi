import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { formatChatVisionError, SUPPORTED_CHAT_IMAGE_TYPES } from '../src/lib/imageAttachment.js';

describe('vision chat client helpers', () => {
  test('maps vision error codes to readable messages', () => {
    const err = new Error('Llama cannot analyze images. Switch to Smart Router.');
    err.code = 'VISION_UNSUPPORTED_MODEL';
    assert.match(formatChatVisionError(err), /cannot analyze images/i);
  });

  test('maps network failures separately from generic AI errors', () => {
    const err = new Error('Failed to fetch');
    assert.match(formatChatVisionError(err), /Could not connect to the server/i);
  });

  test('supports common screenshot MIME types', () => {
    assert.ok(SUPPORTED_CHAT_IMAGE_TYPES.includes('image/png'));
    assert.ok(SUPPORTED_CHAT_IMAGE_TYPES.includes('image/jpeg'));
    assert.ok(SUPPORTED_CHAT_IMAGE_TYPES.includes('image/webp'));
  });
});
