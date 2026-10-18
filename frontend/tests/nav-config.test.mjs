import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  isMoreMenuActive,
  NAV_MOBILE_DOCK,
  NAV_PRIMARY_LINKS,
  NAV_SETTINGS_LINK,
} from '../src/components/Navigation/navConfig.js';

describe('navigation config', () => {
  test('primary links detect active routes', () => {
    const chat = NAV_PRIMARY_LINKS.find((item) => item.to === '/chat');
    assert.equal(chat.isActive('/chat'), true);
    assert.equal(chat.isActive('/chat/settings'), true);
    assert.equal(chat.isActive('/dashboard'), false);
  });

  test('settings link targets /settings and detects active state', () => {
    assert.equal(NAV_SETTINGS_LINK.to, '/settings');
    assert.equal(NAV_SETTINGS_LINK.label, 'Settings');
    assert.equal(NAV_SETTINGS_LINK.isActive('/settings'), true);
    assert.equal(NAV_SETTINGS_LINK.isActive('/dashboard'), false);
  });

  test('mobile dock places Settings after More and before Profile', () => {
    const labels = NAV_MOBILE_DOCK.map((item) => item.label);
    const moreIndex = labels.indexOf('More');
    const settingsIndex = labels.indexOf('Settings');
    const profileIndex = labels.indexOf('Profile');
    assert.ok(moreIndex >= 0);
    assert.equal(settingsIndex, moreIndex + 1);
    assert.equal(profileIndex, settingsIndex + 1);
  });

  test('floating nav renders Settings after More and before theme toggle', async () => {
    const source = await readFile(
      new URL('../src/components/Navigation/FloatingGlassNav.jsx', import.meta.url),
      'utf8',
    );
    const moreIndex = source.indexOf('<NavMoreMenu');
    const settingsIndex = source.indexOf('fg-nav-link--settings');
    const themeIndex = source.indexOf('<NavThemeToggle');
    const profileIndex = source.indexOf('<NavProfileMenu');
    assert.ok(moreIndex > 0);
    assert.ok(settingsIndex > moreIndex);
    assert.ok(themeIndex > settingsIndex);
    assert.ok(profileIndex > themeIndex);
    assert.match(source, /NavSettingsIcon/);
    assert.match(source, /to=\{NAV_SETTINGS_LINK\.to\}/);
  });

  test('more menu active on secondary workspace routes', () => {
    assert.equal(isMoreMenuActive('/provider-health', { canUseDeveloper: false, isOwner: false }), true);
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
