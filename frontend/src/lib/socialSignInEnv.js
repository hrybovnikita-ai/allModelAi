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

/**
 * All iOS/iPadOS browsers use WebKit — popups are unreliable (Safari, Chrome/CriOS, Firefox/FxiOS).
 * Use redirect-only on iOS touch devices.
 */
export function shouldPreferGoogleRedirectSignIn(userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '') {
  if (isCapacitorNativeEnv()) return true;
  return isIosTouchDevice(userAgent);
}

/** Desktop and Android may use popup sign-in when supported. */
export function shouldTryGooglePopupFirst(userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '') {
  if (isCapacitorNativeEnv()) return false;
  return !isIosTouchDevice(userAgent);
}
