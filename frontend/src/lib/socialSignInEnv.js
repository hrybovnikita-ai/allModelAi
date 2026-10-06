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

function isCapacitorNativeEnv() {
  try {
    if (import.meta.env?.VITE_CAPACITOR_NATIVE === 'true') return true;
  } catch {
    /* ignore */
  }
  return false;
}

/** iPhone / iPad / iOS Safari: popups are blocked or report "cancelled" — use redirect only. */
export function shouldPreferGoogleRedirectSignIn(userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '') {
  if (isCapacitorNativeEnv()) return true;
  return isMobileWebSafari(userAgent);
}

/** Desktop Chrome/Edge/Firefox and non-iOS browsers may use popup sign-in. */
export function shouldTryGooglePopupFirst(userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '') {
  if (isCapacitorNativeEnv()) return false;
  return !shouldPreferGoogleRedirectSignIn(userAgent);
}
