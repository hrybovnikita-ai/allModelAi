/** Fallback Firebase Auth host when the branded site proxy is unavailable. */
export const DEFAULT_FIREBASE_AUTH_DOMAIN = 'allmodelai.firebaseapp.com';

/**
 * Branded Google OAuth host shown as "Continue to all-model-ai.com".
 * /__/auth/* is reverse-proxied on this hostname (Vercel → allmodelai.firebaseapp.com).
 */
export const FIREBASE_CUSTOM_AUTH_HOST = 'all-model-ai.com';

/** Optional Firebase Hosting auth subdomain; still accepted if explicitly configured. */
export const FIREBASE_AUTH_SUBDOMAIN_HOST = 'auth.all-model-ai.com';

/**
 * Production app hostnames that should use {@link FIREBASE_CUSTOM_AUTH_HOST} for OAuth
 * so the Google consent screen shows all-model-ai.com, not *.firebaseapp.com.
 */
export const FIREBASE_AUTH_PROXY_HOSTNAMES = new Set([
  'all-model-ai.com',
  'www.all-model-ai.com',
]);

export function isFirebaseAuthProxyHostname(hostname) {
  const host = String(hostname || '').trim().toLowerCase();
  return FIREBASE_AUTH_PROXY_HOSTNAMES.has(host);
}

export function isLocalFirebaseDevHost(hostname) {
  return /^(localhost|127\.0\.0\.1)$/i.test(String(hostname || '').trim());
}

export function isUsableFirebaseConfigValue(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return false;
  if (/^(your[-_]?|replace|changeme|xxx+|test)$/i.test(trimmed)) return false;
  if (/^your[-_]?(project|firebase|app)[-_]?/i.test(trimmed)) return false;
  return true;
}

export function isFirebaseAppDomain(domain) {
  return /\.firebaseapp\.com$/i.test(String(domain || '').trim());
}

export function isExplicitCustomAuthDomain(domain) {
  const trimmed = String(domain || '').trim();
  return isUsableFirebaseConfigValue(trimmed) && !isFirebaseAppDomain(trimmed);
}

/**
 * Last-line guard: on the live AllModelAI site, never initialize Firebase Auth with
 * *.firebaseapp.com. Use the apex so Google shows "Continue to all-model-ai.com".
 */
export function coerceProductionAuthDomain(authDomain, hostedHostname) {
  const domain = String(authDomain || '').trim();
  const hosted = String(hostedHostname || '').trim().toLowerCase();
  if (!hosted || isLocalFirebaseDevHost(hosted) || !isFirebaseAuthProxyHostname(hosted)) {
    return domain;
  }
  if (domain === FIREBASE_CUSTOM_AUTH_HOST || domain === FIREBASE_AUTH_SUBDOMAIN_HOST) {
    return FIREBASE_CUSTOM_AUTH_HOST;
  }
  return FIREBASE_CUSTOM_AUTH_HOST;
}

/**
 * @param {string} configuredAuthDomain
 * @param {{ envAuthDomain?: string, customAuthDomainEnabled?: boolean, hostedHostname?: string, preferHostedAuthDomainWhenProxied?: boolean }} [options]
 */
export function resolveAuthDomainForRuntime(configuredAuthDomain, options = {}) {
  const configured = String(configuredAuthDomain || '').trim();
  const envDomain = String(options.envAuthDomain || '').trim();
  const hosted = String(options.hostedHostname || '').trim().toLowerCase();

  if (isLocalFirebaseDevHost(hosted)) {
    if (isExplicitCustomAuthDomain(envDomain)) return envDomain;
    if (isFirebaseAppDomain(envDomain)) return envDomain;
    if (isFirebaseAppDomain(configured)) return configured;
    return DEFAULT_FIREBASE_AUTH_DOMAIN;
  }

  if (isExplicitCustomAuthDomain(envDomain)) {
    if (isFirebaseAuthProxyHostname(hosted) && envDomain === FIREBASE_AUTH_SUBDOMAIN_HOST) {
      return FIREBASE_CUSTOM_AUTH_HOST;
    }
    if (isFirebaseAuthProxyHostname(hosted) && envDomain === FIREBASE_CUSTOM_AUTH_HOST) {
      return FIREBASE_CUSTOM_AUTH_HOST;
    }
    return envDomain;
  }

  const useHostedAuth = Boolean(
    hosted
    && !isLocalFirebaseDevHost(hosted)
    && (
      options.customAuthDomainEnabled
      || isFirebaseAuthProxyHostname(hosted)
      || (
        options.preferHostedAuthDomainWhenProxied
        && isFirebaseAppDomain(configured)
        && !isFirebaseAppDomain(hosted)
      )
    ),
  );

  if (useHostedAuth) {
    if (isFirebaseAuthProxyHostname(hosted)) {
      return FIREBASE_CUSTOM_AUTH_HOST;
    }
    return hosted;
  }

  if (isUsableFirebaseConfigValue(envDomain)) {
    if (isFirebaseAppDomain(envDomain) && isFirebaseAuthProxyHostname(hosted)) {
      return FIREBASE_CUSTOM_AUTH_HOST;
    }
    return envDomain;
  }

  if (isUsableFirebaseConfigValue(configured)) {
    if (isFirebaseAppDomain(configured) && isFirebaseAuthProxyHostname(hosted)) {
      return FIREBASE_CUSTOM_AUTH_HOST;
    }
    return configured;
  }

  return DEFAULT_FIREBASE_AUTH_DOMAIN;
}
