function isSocialAuthDebugEnabled() {
  if (import.meta.env?.DEV) return true;
  try {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('authdebug') === '1') return true;
    }
  } catch {
    /* ignore */
  }
  try {
    return globalThis.localStorage?.getItem('allmodelai_social_auth_debug') === '1';
  } catch {
    return false;
  }
}

const STAGES = new Set([
  'GOOGLE_AUTH_START',
  'GOOGLE_AUTH_STRATEGY',
  'GOOGLE_AUTH_FAILED',
  'FIREBASE_REDIRECT_START',
  'FIREBASE_REDIRECT_RETURN',
  'FIREBASE_REDIRECT_RESULT',
  'FIREBASE_AUTH_STATE_RESTORED',
  'FIREBASE_ID_TOKEN_READY',
  'BACKEND_CHALLENGE_START',
  'BACKEND_CHALLENGE_SUCCESS',
  'BACKEND_CHALLENGE_FAILED',
  'BACKEND_AUTH_API_OK',
  'BACKEND_SESSION_EXCHANGE_START',
  'BACKEND_SESSION_EXCHANGE_SUCCESS',
  'BACKEND_SESSION_EXCHANGE_FAILED',
  'BACKEND_SET_SESSION_COMPLETE',
  'SESSION_CONFIRMED',
  'SESSION_CONFIRM_START',
  'SESSION_CONFIRM_OK',
  'SESSION_CONFIRM_401',
  'SESSION_PROVIDER_AUTHENTICATED',
  'SESSION_PROVIDER_ANONYMOUS',
  'REDIRECT_RECOVERY_START',
  'REDIRECT_RESULT_FOUND',
  'DASHBOARD_REDIRECT',
  'GOOGLE_LOGIN_START',
  'FIREBASE_REDIRECT_BEGIN',
  'APP_RETURNED_FROM_GOOGLE',
  'GET_REDIRECT_RESULT_BEGIN',
  'GET_REDIRECT_RESULT_SUCCESS',
  'GET_REDIRECT_RESULT_NULL',
  'AUTH_STATE_USER_FOUND',
  'FIREBASE_USER_RESTORED',
  'BACKEND_SESSION_EXCHANGE_BEGIN',
  'BACKEND_SESSION_EXCHANGE_STARTED',
  'GOOGLE_REDIRECT_STARTED',
  'GOOGLE_REDIRECT_RESULT',
  'GET_REDIRECT_RESULT_TIMEOUT',
  'AUTH_PERSISTENCE_READY',
  'REDIRECT_RECOVERY_PIPELINE_START',
  'REDIRECT_RECOVERY_PIPELINE_SUCCESS',
  'REDIRECT_RECOVERY_PIPELINE_EMPTY',
  'REDIRECT_RECOVERY_FAILED',
  'BACKEND_CHALLENGE_AFTER_REDIRECT',
  'FIREBASE_USER_READY',
  'FIREBASE_ID_TOKEN_FAILED',
  'SESSION_PROVIDER_INIT_TIMEOUT_DEFERRED',
  'REDIRECT_PREREQUISITES_READY',
  'REDIRECT_PREREQUISITES_FAILED',
  'REDIRECT_RECOVERY_DEFERRED',
  'FIREBASE_AUTH_DOMAIN_READY',
  'AUTH_DOMAIN_MISMATCH',
  'FIREBASE_REDIRECT_RESULT_MISSING',
  'FIREBASE_USER_UNAVAILABLE',
  'FIREBASE_OAUTH_CONFIG_ERROR',
  'GET_REDIRECT_RESULT_RETRY',
  'SESSION_CONFIRM_FAILED',
  'SESSION_COOKIE_MISSING',
]);

/** Unified auth tracing (`localStorage.allmodelai_social_auth_debug=1` or DEV). */
export function authLog(message, detail = {}) {
  if (!isSocialAuthDebugEnabled()) return;
  const safeDetail = { ...detail };
  for (const key of Object.keys(safeDetail)) {
    if (/token|password|secret|cookie|credential|idtoken|apikey|authorization/i.test(key)) {
      delete safeDetail[key];
    }
  }
  console.info(
    `[AllModelAI:Auth] ${message}`,
    Object.keys(safeDetail).length ? safeDetail : '',
  );
}

/** @deprecated alias */
export function authRecoveryLog(message, detail = {}) {
  authLog(message, detail);
}

export function socialAuthDebug(stage, detail = {}) {
  if (!isSocialAuthDebugEnabled() || !STAGES.has(stage)) return;
  const safeDetail = { ...detail };
  for (const key of Object.keys(safeDetail)) {
    if (/token|password|secret|cookie|credential|idtoken|apikey|authorization/i.test(key)) {
      delete safeDetail[key];
    }
  }
  if (safeDetail.url && typeof safeDetail.url === 'string') {
    try {
      const parsed = new URL(safeDetail.url, 'https://localhost');
      safeDetail.pathname = parsed.pathname;
      delete safeDetail.url;
    } catch {
      delete safeDetail.url;
    }
  }
  console.info(`[AllModelAI:SocialAuth] ${stage}`, safeDetail);
}

export function describeRedirectRecoveryFailure(context = {}) {
  authLog('Redirect recovery failed', context);
  if (context.reason === 'redirect-result-null') {
    return 'Google sign-in could not be completed after redirect. Please try again, or use email and password.';
  }
  return 'Google sign-in could not be completed. Please try again, or sign in with email and password.';
}

const SOCIAL_ERROR_STORAGE_KEY = 'allmodelai_social_error';
const SOCIAL_ERROR_CODE_KEY = 'allmodelai_social_error_code';

export function persistSocialAuthError(errorOrMessage, code = '') {
  const message = typeof errorOrMessage === 'string'
    ? errorOrMessage
    : (errorOrMessage?.message || 'Google sign-in could not be completed. Please try again.');
  try {
    sessionStorage.setItem(SOCIAL_ERROR_STORAGE_KEY, message);
    if (code) {
      sessionStorage.setItem(SOCIAL_ERROR_CODE_KEY, String(code));
    }
  } catch {
    /* Safari private mode */
  }
}

export function consumeStoredSocialAuthErrorCode() {
  try {
    const code = sessionStorage.getItem(SOCIAL_ERROR_CODE_KEY);
    if (code) {
      sessionStorage.removeItem(SOCIAL_ERROR_CODE_KEY);
      return code;
    }
  } catch {
    /* ignore */
  }
  return '';
}
