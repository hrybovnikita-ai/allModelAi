const STAGES = new Set([
  'GOOGLE_REDIRECT_STARTED',
  'GOOGLE_REDIRECT_RESULT',
  'FIREBASE_USER_RESTORED',
  'FIREBASE_ID_TOKEN_READY',
  'BACKEND_SESSION_EXCHANGE_STARTED',
  'BACKEND_SESSION_EXCHANGE_SUCCESS',
  'BACKEND_SESSION_EXCHANGE_FAILED',
  'DASHBOARD_REDIRECT',
]);

export function socialAuthDebug(stage, detail = {}) {
  if (!import.meta.env?.DEV || !STAGES.has(stage)) return;
  const safeDetail = { ...detail };
  for (const key of Object.keys(safeDetail)) {
    if (/token|password|secret|cookie|credential|idtoken/i.test(key)) {
      delete safeDetail[key];
    }
  }
  console.info(`[AllModelAI:SocialAuth] ${stage}`, safeDetail);
}
