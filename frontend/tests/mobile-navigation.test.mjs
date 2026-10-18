import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import {
  DASHBOARD_NAV_ACCOUNT_LINKS,
  DASHBOARD_NAV_LINKS,
} from '../src/components/Dashboard/dashboardNavLinks.js';

test('mobile dashboard menu includes Profile and Settings for authenticated users', () => {
  assert.ok(DASHBOARD_NAV_LINKS.some((item) => item.to === '/settings' && item.label === 'Profile'));
  assert.ok(
    DASHBOARD_NAV_LINKS.some(
      (item) => item.to === '/settings#settings-security' && item.label === 'Settings',
    ),
  );
  assert.equal(DASHBOARD_NAV_ACCOUNT_LINKS.length, 3);
});

test('dashboard workspace nav closes mobile menu after navigation', async () => {
  // DashboardWorkspaceNav re-exports FloatingGlassNav, which closes menus on route change / link click.
  const wrapper = await readFile(
    new URL('../src/components/Dashboard/DashboardWorkspaceNav.jsx', import.meta.url),
    'utf8',
  );
  const floating = await readFile(
    new URL('../src/components/Navigation/FloatingGlassNav.jsx', import.meta.url),
    'utf8',
  );
  const links = await readFile(
    new URL('../src/components/Dashboard/dashboardNavLinks.js', import.meta.url),
    'utf8',
  );
  assert.match(wrapper, /FloatingGlassNav/);
  assert.match(links, /DASHBOARD_NAV_ACCOUNT_LINKS/);
  assert.match(floating, /setMoreOpen\(false\)/);
  assert.match(floating, /setProfileOpen\(false\)/);
  assert.match(floating, /location\.pathname/);
});

test('homepage navbar keeps account links in mobile drawer and user menu on desktop', async () => {
  const navbar = await readFile(new URL('../src/components/Navbar/Navbar.jsx', import.meta.url), 'utf8');
  const navAuth = await readFile(
    new URL('../src/components/Navbar/NavAuthSection.jsx', import.meta.url),
    'utf8',
  );
  assert.match(navbar, /DASHBOARD_NAV_ACCOUNT_LINKS/);
  assert.match(navbar, /nav-links-account--mobile/);
  assert.match(navAuth, /nav-user-menu/);
  assert.match(navAuth, /DASHBOARD_NAV_ACCOUNT_LINKS/);
});

test('settings page exposes profile and security anchors', async () => {
  const settings = await readFile(new URL('../src/components/Settings/Settings.jsx', import.meta.url), 'utf8');
  const security = await readFile(
    new URL('../src/components/Settings/AccountSecurity.jsx', import.meta.url),
    'utf8',
  );
  assert.match(settings, /id="settings-profile"/);
  assert.match(security, /id="settings-security"/);
  assert.match(settings, /settings-section-nav/);
  assert.match(settings, /#settings-security/);
  assert.match(settings, /#settings-general/);
  assert.match(settings, /#settings-billing/);
  assert.match(settings, /#settings-privacy/);
  assert.match(settings, /AccountSecurity/);
  assert.match(settings, /updateAccountProfile/);
});
