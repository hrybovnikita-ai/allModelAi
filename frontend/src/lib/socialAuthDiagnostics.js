const STAGES = new Set([
  'GOOGLE_AUTH_START',
  'GOOGLE_AUTH_STRATEGY',
  'FIREBASE_REDIRECT_START',
  'FIREBASE_REDIRECT_RETURN',
  'FIREBASE_REDIRECT_RESULT',
  'FIREBASE_AUTH_STATE_RESTORED',
  'FIREBASE_ID_TOKEN_READY',
  'BACKEND_CHALLENGE_START',
  'BACKEND_CHALLENGE_SUCCESS',
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
  if (!import.meta.env?.DEV || !STAGES.has(stage)) return;
  const safeDetail = { ...detail };
  for (const key of Object.keys(safeDetail)) {
    if (/token|password|secret|cookie|credential|idtoken|apikey/i.test(key)) {
      delete safeDetail[key];
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
