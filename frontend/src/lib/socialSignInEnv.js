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

/**
 * Legacy helper: full-page redirect is no longer the default on iOS Safari.
 * Popup sign-in runs inside the user gesture; redirect is only used as fallback.
 */
export function shouldPreferGoogleRedirectSignIn(userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '') {
  void userAgent;
  return false;
}

/** True when popup should be attempted before redirect (modern iPadOS Safari + desktop). */
export function shouldTryGooglePopupFirst(userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '') {
  if (typeof navigator !== 'undefined' && isCapacitorNativeEnv()) return false;
  void userAgent;
  return true;
}

function isCapacitorNativeEnv() {
  try {
    if (import.meta.env?.VITE_CAPACITOR_NATIVE === 'true') return true;
  } catch {
    /* ignore */
  }
  return false;
}
