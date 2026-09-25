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
  if (width < 480) return 'phone';
  if (width < 768) return 'phone';
  if (width < 1024) return 'tablet';
  if (width < 1440) return 'laptop';
  return 'desktop';
}

export function applyDeviceProfile() {
  const html = document.documentElement;
  const apply = () => {
    html.dataset.platform = detectPlatform();
    html.dataset.viewport = detectViewport(window.innerWidth);
    html.dataset.orientation =
      window.matchMedia('(orientation: landscape)').matches ? 'landscape' : 'portrait';
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
}
