import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { detectViewportTier } from '../src/lib/deviceProfile.js';

test('viewport tier buckets cover representative CSS widths', () => {
  const expected = {
    320: 'phone-sm',
    375: 'phone',
    390: 'phone',
    430: 'phone',
    431: 'phone-lg',
    768: 'tablet',
    820: 'tablet',
    1024: 'laptop-sm',
    1280: 'laptop',
    1440: 'laptop',
    1920: 'desktop',
    2560: 'ultrawide',
  };
  for (const [width, tier] of Object.entries(expected)) {
    assert.equal(detectViewportTier(Number(width)), tier, `width ${width}`);
  }
});

test('global responsive styles define safe areas and overflow guards', async () => {
  const responsive = await readFile(new URL('../src/styles/responsive.css', import.meta.url), 'utf8');
  const pages = await readFile(new URL('../src/styles/responsive-pages.css', import.meta.url), 'utf8');
  assert.match(responsive, /--safe-top/);
  assert.match(responsive, /overflow-x:\s*clip/);
  assert.match(pages, /min-width:\s*0/);
  assert.match(pages, /settings-section-nav/);
  assert.match(pages, /keyboard-inset/);
});

test('pricing grid uses content-driven minmax columns', async () => {
  const pricing = await readFile(
    new URL('../src/components/Pricing/Pricing.css', import.meta.url),
    'utf8',
  );
  assert.match(pricing, /minmax\(min\(100%,\s*280px\)/);
});

test('device profile exposes visual viewport keyboard handling', async () => {
  const source = await readFile(new URL('../src/lib/deviceProfile.js', import.meta.url), 'utf8');
  assert.match(source, /visualViewport/);
  assert.match(source, /viewportTier/);
  assert.match(source, /keyboardOpen/);
});

test('navbar uses tablet breakpoint for mobile drawer and keeps desktop center nav', async () => {
  const navbarCss = await readFile(
    new URL('../src/components/Navbar/Navbar.css', import.meta.url),
    'utf8',
  );
  const navbarJsx = await readFile(
    new URL('../src/components/Navbar/Navbar.jsx', import.meta.url),
    'utf8',
  );
  assert.match(navbarCss, /max-width:\s*1023px/);
  assert.match(navbarCss, /nav-links-account--mobile/);
  assert.match(navbarCss, /min-width:\s*1024px/);
  assert.match(navbarJsx, /nav-links-account nav-links-account--mobile/);
  assert.match(navbarJsx, /aria-controls=\{navMenuId\}/);
  assert.match(navbarJsx, /nav-menu-backdrop/);
});

test('model cards define phone, tablet, and desktop grid tiers', async () => {
  const models = await readFile(
    new URL('../src/components/ModelsSection/ModelsSection.css', import.meta.url),
    'utf8',
  );
  assert.match(models, /repeat\(4,/);
  assert.match(models, /repeat\(3,/);
  assert.match(models, /repeat\(2,/);
  assert.match(models, /grid-template-columns:\s*1fr/);
});

test('header stacks hero and keeps provider orbit on mobile', async () => {
  const header = await readFile(
    new URL('../src/components/Header/Header.css', import.meta.url),
    'utf8',
  );
  const orbit = await readFile(
    new URL('../src/components/Header/HeroProviderOrbit.css', import.meta.url),
    'utf8',
  );
  assert.match(header, /header-content--stack/);
  assert.match(orbit, /max-width: 767px/);
  assert.doesNotMatch(orbit, /display:\s*none/);
});
