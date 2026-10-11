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

  test('AI_BILLING uses provider billing copy for text chat, vision copy only with image', () => {
    const billing = new Error('Claude could not complete this request because the provider account has insufficient balance or quota.');
    billing.code = 'AI_BILLING';
    assert.match(formatChatVisionError(billing, { hadImage: false }), /selected AI service|insufficient balance or quota/i);
    assert.doesNotMatch(formatChatVisionError(billing, { hadImage: false }), /vision provider/i);
    const visionBilling = new Error('');
    visionBilling.code = 'AI_BILLING';
    assert.match(formatChatVisionError(visionBilling, { hadImage: true }), /vision provider/i);
  });

  test('supports common screenshot MIME types', () => {
    assert.ok(SUPPORTED_CHAT_IMAGE_TYPES.includes('image/png'));
    assert.ok(SUPPORTED_CHAT_IMAGE_TYPES.includes('image/jpeg'));
    assert.ok(SUPPORTED_CHAT_IMAGE_TYPES.includes('image/webp'));
  });
});
