function detectPlatform() {
  const ua = navigator.userAgent || '';
  const isIOS =
    /iPhone|iPad|iPod/i.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isIOS) return 'ios';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'mac';
  if (/Windows/i.test(ua)) return 'windows';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}

function detectViewport(width) {
  if (width < 768) return 'phone';
  if (width < 1024) return 'tablet';
  if (width < 1440) return 'laptop';
  return 'desktop';
}

/** Finer tier for CSS hooks — not tied to specific device models. */
export function detectViewportTier(width) {
  if (width <= 374) return 'phone-sm';
  if (width <= 430) return 'phone';
  if (width <= 767) return 'phone-lg';
  if (width <= 1023) return 'tablet';
  if (width <= 1279) return 'laptop-sm';
  if (width <= 1919) return 'laptop';
  if (width <= 2559) return 'desktop';
  return 'ultrawide';
}

function applyVisualViewportInsets(html) {
  const vv = window.visualViewport;
  if (!vv) {
    html.style.removeProperty('--keyboard-inset');
    html.style.removeProperty('--visual-viewport-height');
    html.dataset.keyboardOpen = 'false';
    return;
  }
  const keyboardInset = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
  html.style.setProperty('--keyboard-inset', `${keyboardInset}px`);
  html.style.setProperty('--visual-viewport-height', `${Math.round(vv.height)}px`);
  html.dataset.keyboardOpen = keyboardInset > 80 ? 'true' : 'false';
}

export function applyDeviceProfile() {
  const html = document.documentElement;
  const apply = () => {
    const width = window.innerWidth;
    html.dataset.platform = detectPlatform();
    html.dataset.viewport = detectViewport(width);
    html.dataset.viewportTier = detectViewportTier(width);
    html.dataset.orientation =
      window.matchMedia('(orientation: landscape)').matches ? 'landscape' : 'portrait';
    applyVisualViewportInsets(html);
  };

  apply();

  let resizeTimer;
  window.addEventListener(
    'resize',
    () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(apply, 120);
    },
    { passive: true }
  );

  window.matchMedia('(orientation: landscape)').addEventListener('change', apply);

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', apply, { passive: true });
    window.visualViewport.addEventListener('scroll', apply, { passive: true });
  }
}
