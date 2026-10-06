function isSocialAuthDebugEnabled() {
  if (import.meta.env?.DEV) return true;
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
  'SESSION_CONFIRMED',
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
]);

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
  const parts = ['Google sign-in could not be completed on this device.'];
  if (import.meta.env?.DEV) {
    if (context.consumer) parts.push(`consumer=${context.consumer}`);
    if (context.reason) parts.push(`reason=${context.reason}`);
    if (context.authDomain) parts.push(`authDomain=${context.authDomain}`);
    if (context.path) parts.push(`path=${context.path}`);
    if (context.hasIntent != null) parts.push(`hasIntent=${context.hasIntent}`);
    if (context.redirectConsumed != null) parts.push(`redirectConsumed=${context.redirectConsumed}`);
  } else {
    parts.push('Try again, or sign in with email and password.');
  }
  return parts.join(' ');
}
