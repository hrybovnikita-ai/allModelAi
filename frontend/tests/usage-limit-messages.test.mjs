import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatResetRemaining,
  isUserQuotaExceeded,
  usageLimitCopy,
} from '../src/lib/usageLimitMessages.js';

test('user quota codes are distinct from provider failures', () => {
  assert.equal(isUserQuotaExceeded({ code: 'USER_QUOTA_EXCEEDED' }), true);
  assert.equal(isUserQuotaExceeded({ code: 'PLAN_LIMIT_REACHED' }), true);
  assert.equal(isUserQuotaExceeded({ code: 'AI_BILLING' }), false);
  assert.equal(isUserQuotaExceeded({ status: 402 }), false);
});

test('usage limit copy localizes title and buttons', () => {
  assert.equal(usageLimitCopy('en').title, "You've reached your usage limit");
  assert.equal(usageLimitCopy('ru').title, 'Вы достигли лимита использования');
  assert.equal(usageLimitCopy('uk').title, 'Ви досягли ліміту використання');
  assert.equal(usageLimitCopy('pl').title, 'Osiągnięto limit wykorzystania');
  assert.equal(usageLimitCopy('xx').title, usageLimitCopy('en').title);
});

test('reset countdown uses verified timestamps only', () => {
  assert.equal(formatResetRemaining(null, 'en'), null);
  const resetAt = new Date(Date.now() + (3 * 60 + 25) * 60_000).toISOString();
  assert.match(formatResetRemaining(resetAt, 'en'), /3 hours/);
  assert.match(formatResetRemaining(resetAt, 'ru'), /3 часа/);
  assert.match(formatResetRemaining(resetAt, 'uk'), /3 години/);
  assert.match(formatResetRemaining(resetAt, 'pl'), /3 godziny/);
});
