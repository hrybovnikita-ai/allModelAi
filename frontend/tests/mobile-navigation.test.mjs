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
  const source = await readFile(
    new URL('../src/components/Dashboard/DashboardWorkspaceNav.jsx', import.meta.url),
    'utf8',
  );
  assert.match(source, /closeMobileMenu/);
  assert.match(source, /onClick=\{closeMobileMenu\}/);
  assert.match(source, /DASHBOARD_NAV_ACCOUNT_LINKS/);
});

test('homepage navbar shows account links when session is authenticated', async () => {
  const source = await readFile(new URL('../src/components/Navbar/Navbar.jsx', import.meta.url), 'utf8');
  assert.match(source, /DASHBOARD_NAV_ACCOUNT_LINKS/);
  assert.match(source, /isAuthenticated/);
  assert.match(source, /nav-links-account/);
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
});
