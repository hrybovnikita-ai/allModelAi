export function isIosTouchDevice(userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '') {
  const ua = String(userAgent || '');
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  if (typeof navigator !== 'undefined'
    && navigator.platform === 'MacIntel'
    && Number(navigator.maxTouchPoints) > 1) {
    return true;
  }
  return false;
}

export function isMobileWebSafari(userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '') {
  const ua = String(userAgent || '');
  if (!isIosTouchDevice(ua)) return false;
  return /Safari/i.test(ua) && !/Chrome|CriOS|FxiOS|EdgiOS/i.test(ua);
}

/** iPhone/iPad Safari should use redirect sign-in; popups often fail to hand results back to the SPA. */
export function shouldPreferGoogleRedirectSignIn(userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '') {
  return isMobileWebSafari(userAgent);
}
