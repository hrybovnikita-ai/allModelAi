import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { isMoreMenuActive, NAV_PRIMARY_LINKS } from '../src/components/Navigation/navConfig.js';

describe('navigation config', () => {
  test('primary links detect active routes', () => {
    const chat = NAV_PRIMARY_LINKS.find((item) => item.to === '/chat');
    assert.equal(chat.isActive('/chat'), true);
    assert.equal(chat.isActive('/chat/settings'), true);
    assert.equal(chat.isActive('/dashboard'), false);
  });

  test('more menu active on secondary workspace routes', () => {
    assert.equal(isMoreMenuActive('/storage', { canUseDeveloper: true, isOwner: false }), true);
    assert.equal(isMoreMenuActive('/dashboard', { canUseDeveloper: true, isOwner: false }), false);
    assert.equal(
      isMoreMenuActive('/developer/model-diagnostics', { canUseDeveloper: true, isOwner: false }),
      true,
    );
    assert.equal(
      isMoreMenuActive('/developer/model-diagnostics', { canUseDeveloper: false, isOwner: false }),
      false,
    );
  });
});
