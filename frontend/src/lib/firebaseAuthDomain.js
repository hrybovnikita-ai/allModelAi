/** Default Firebase Auth host (Google OAuth / __/auth/handler). */
export const DEFAULT_FIREBASE_AUTH_DOMAIN = 'allmodelai.firebaseapp.com';

export function isUsableFirebaseConfigValue(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return false;
  if (/^(your[-_]?|replace|changeme|xxx+|test)$/i.test(trimmed)) return false;
  if (/^your[-_]?(project|firebase|api|app)[-_]?/i.test(trimmed)) return false;
  return true;
}

function isFirebaseAppDomain(domain) {
  return /\.firebaseapp\.com$/i.test(String(domain || '').trim());
}

/**
 * @param {string} configuredAuthDomain
 * @param {{ envAuthDomain?: string, customAuthDomainEnabled?: boolean, hostedHostname?: string, preferHostedAuthDomainWhenProxied?: boolean }} [options]
 */
export function resolveAuthDomainForRuntime(configuredAuthDomain, options = {}) {
  const configured = String(configuredAuthDomain || '').trim();
  const envDomain = String(options.envAuthDomain || '').trim();
  const hosted = String(options.hostedHostname || '').trim();

  if (isUsableFirebaseConfigValue(envDomain)) {
    return envDomain;
  }

  if (hosted && options.customAuthDomainEnabled) {
    return hosted;
  }

  if (
    options.preferHostedAuthDomainWhenProxied
    && hosted
    && isFirebaseAppDomain(configured)
    && !isFirebaseAppDomain(hosted)
  ) {
    return hosted;
  }

  if (isUsableFirebaseConfigValue(configured)) {
    return configured;
  }

  return DEFAULT_FIREBASE_AUTH_DOMAIN;
}
