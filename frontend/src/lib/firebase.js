import { deleteApp, initializeApp, getApps } from 'firebase/app';
import {
  initializeAuth,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  inMemoryPersistence,
  browserPopupRedirectResolver,
  setPersistence,
} from 'firebase/auth';
import { getPublicAppOrigin, isHostedWebApp } from './apiBase.js';
import { isIosTouchDevice, isMobileWebSafari } from './socialSignInEnv.js';
import { authRecoveryLog, socialAuthDebug } from './socialAuthDiagnostics.js';
import { shouldAttemptGoogleRedirectRecovery } from './socialRedirectState.js';
import {
  coerceProductionAuthDomain,
  DEFAULT_FIREBASE_AUTH_DOMAIN,
  isExplicitCustomAuthDomain,
  isFirebaseAppDomain,
  isFirebaseAuthProxyHostname,
  isLocalFirebaseDevHost,
  isUsableFirebaseConfigValue as isUsableFirebaseConfigValueCore,
  resolveAuthDomainForRuntime as resolveAuthDomainCore,
} from './firebaseAuthDomain.js';

export { DEFAULT_FIREBASE_AUTH_DOMAIN };

const CONFIG_ENV_KEYS = {
  apiKey: 'VITE_FIREBASE_API_KEY',
  authDomain: 'VITE_FIREBASE_AUTH_DOMAIN',
  projectId: 'VITE_FIREBASE_PROJECT_ID',
  appId: 'VITE_FIREBASE_APP_ID',
};

let runtimeFirebaseConfig = null;
/** Firebase Auth instance (named to avoid TDZ/collision with firebase/auth exports). */
let socialAuthInstance;

function readFirebaseAuthDomainFromEnv(viteEnv) {
  return viteEnv.VITE_FIREBASE_AUTH_DOMAIN
    || viteEnv.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
    || '';
}

function readViteFirebaseEnv() {
  const viteEnv = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : {};
  return {
    apiKey: viteEnv.VITE_FIREBASE_API_KEY,
    authDomain: readFirebaseAuthDomainFromEnv(viteEnv),
    projectId: viteEnv.VITE_FIREBASE_PROJECT_ID,
    appId: viteEnv.VITE_FIREBASE_APP_ID,
  };
}

export function isUsableFirebaseConfigValue(value) {
  return isUsableFirebaseConfigValueCore(value);
}

function pickField(envValue, runtimeValue) {
  if (isUsableFirebaseConfigValue(envValue)) return String(envValue).trim();
  if (isUsableFirebaseConfigValue(runtimeValue)) return String(runtimeValue).trim();
  return '';
}

/** When true, prefer hosted authDomain resolution (legacy Vercel /__/auth proxy on the app hostname). */
export function isCustomAuthDomainEnabled() {
  return import.meta.env?.VITE_FIREBASE_CUSTOM_AUTH_DOMAIN === 'true';
}

/** Page hostname for OAuth authDomain coercion (not the API host). */
function hostedSiteAuthDomain() {
  if (typeof window === 'undefined' || !isHostedWebApp()) return '';
  return String(window.location?.hostname || '').trim().toLowerCase();
}

/**
 * authDomain must match where /__/auth/handler is served.
 * Production: all-model-ai.com (Vercel reverse-proxies /__/auth to Firebase).
 * Local dev: allmodelai.firebaseapp.com with the Vite /__/auth proxy (never branded authDomain on localhost).
 */
/** iOS WebKit: avoid default *.firebaseapp.com redirect URI when a custom auth host is available. */
export function shouldPreferHostedFirebaseAuthDomain() {
  if (typeof window === 'undefined' || !isHostedWebApp()) return false;
  const hosted = hostedSiteAuthDomain();
  if (!hosted || /localhost|127\.0\.0\.1/i.test(hosted)) return false;
  return isMobileWebSafari() || isIosTouchDevice();
}

export function resolveAuthDomainForRuntime(configuredAuthDomain) {
  const viteEnv = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : {};
  const envAuthDomain = readFirebaseAuthDomainFromEnv(viteEnv);
  const pageHost = typeof window !== 'undefined' ? window.location?.hostname : '';
  const hosted = hostedSiteAuthDomain() || pageHost;

  if (isLocalFirebaseDevHost(hosted) || isLocalFirebaseDevHost(pageHost)) {
    if (isFirebaseAppDomain(envAuthDomain)) return String(envAuthDomain).trim();
    if (isFirebaseAppDomain(configuredAuthDomain)) return String(configuredAuthDomain).trim();
    return DEFAULT_FIREBASE_AUTH_DOMAIN;
  }

  if (isExplicitCustomAuthDomain(envAuthDomain)) {
    return String(envAuthDomain).trim();
  }
  const customAuth = isCustomAuthDomainEnabled();
  const onProductionSite = isFirebaseAuthProxyHostname(hosted);

  if (shouldPreferHostedFirebaseAuthDomain() && hosted) {
    return resolveAuthDomainCore(configuredAuthDomain, {
      envAuthDomain,
      customAuthDomainEnabled: customAuth || onProductionSite,
      hostedHostname: hosted,
      preferHostedAuthDomainWhenProxied: customAuth,
    });
  }

  return resolveAuthDomainCore(configuredAuthDomain, {
    envAuthDomain,
    customAuthDomainEnabled: customAuth || onProductionSite,
    hostedHostname: hosted,
    preferHostedAuthDomainWhenProxied: customAuth,
  });
}

export function buildFirebaseClientConfig() {
  const fromEnv = readViteFirebaseEnv();
  const runtime = runtimeFirebaseConfig || {};
  const merged = {
    apiKey: pickField(fromEnv.apiKey, runtime.apiKey),
    authDomain: pickField(fromEnv.authDomain, runtime.authDomain),
    projectId: pickField(fromEnv.projectId, runtime.projectId),
    appId: pickField(fromEnv.appId, runtime.appId),
  };
  merged.authDomain = resolveAuthDomainForRuntime(merged.authDomain);
  merged.authDomain = coerceProductionAuthDomain(merged.authDomain, hostedSiteAuthDomain());
  if (!isUsableFirebaseConfigValue(merged.authDomain)) {
    merged.authDomain = DEFAULT_FIREBASE_AUTH_DOMAIN;
    merged.authDomain = coerceProductionAuthDomain(merged.authDomain, hostedSiteAuthDomain());
  }
  return merged;
}

export function getEffectiveFirebaseConfig() {
  return buildFirebaseClientConfig();
}

export function applyRuntimeFirebaseConfig(config) {
  if (!config || typeof config !== 'object') return;
  runtimeFirebaseConfig = {
    apiKey: config.apiKey,
    authDomain: config.authDomain,
    projectId: config.projectId,
    appId: config.appId,
  };
}

export function getFirebaseConfigEnvKeys() {
  return { ...CONFIG_ENV_KEYS };
}

export function getMissingFirebaseConfigKeys() {
  const config = getEffectiveFirebaseConfig();
  return Object.entries(CONFIG_ENV_KEYS)
    .filter(([field]) => !isUsableFirebaseConfigValue(config[field]))
    .map(([, envName]) => envName);
}

export function isFirebaseSocialConfigured() {
  const config = getEffectiveFirebaseConfig();
  return Object.values(config).every((value) => isUsableFirebaseConfigValue(value));
}

export function getFirebaseOAuthOrigin() {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return getPublicAppOrigin();
}

export function assertFirebaseOAuthEnvironment() {
  if (typeof window === 'undefined') return;
  const oauthOrigin = getFirebaseOAuthOrigin();
  if (!oauthOrigin) return;

  const pageHost = String(window.location?.hostname || '').trim().toLowerCase();
  const authDomain = getEffectiveFirebaseConfig().authDomain;
  if (isLocalFirebaseDevHost(pageHost) && isExplicitCustomAuthDomain(readFirebaseAuthDomainFromEnv(import.meta.env || {}))) {
    socialAuthDebug('AUTH_DOMAIN_MISMATCH', {
      pageHost,
      authDomain,
      note: 'localhost uses firebaseapp.com authDomain; branded env is ignored for popup OAuth',
    });
  }

  const configuredPublic = stripPublicOrigin(getPublicAppOrigin());
  const livePublic = stripPublicOrigin(oauthOrigin);
  if (configuredPublic && livePublic && configuredPublic !== livePublic) {
    console.info(
      `[AllModelAI] OAuth origin is ${livePublic} (VITE_PUBLIC_APP_URL is ${configuredPublic}). `
      + 'Ensure this host is listed in Firebase Authorized domains.',
    );
  }
}

function stripPublicOrigin(value) {
  try {
    return String(value || '').replace(/\/$/, '');
  } catch {
    return '';
  }
}

/** Prefer localStorage persistence so sessions survive reloads and app switches on mobile & desktop. */
function persistenceChainForInit() {
  return [
    browserLocalPersistence,
    indexedDBLocalPersistence,
    browserSessionPersistence,
    inMemoryPersistence,
  ];
}

function persistenceLabel(persistence) {
  if (persistence === indexedDBLocalPersistence) return 'indexedDB';
  if (persistence === browserLocalPersistence) return 'browserLocal';
  if (persistence === browserSessionPersistence) return 'browserSession';
  if (persistence === inMemoryPersistence) return 'inMemory';
  return 'unknown';
}

function initializeSocialAuth(app) {
  for (const persistence of persistenceChainForInit()) {
    try {
      const instance = initializeAuth(app, {
        persistence,
        popupRedirectResolver: browserPopupRedirectResolver,
      });
      socialAuthDebug('AUTH_PERSISTENCE_READY', { persistence: persistenceLabel(persistence), phase: 'init' });
      return instance;
    } catch {
      /* Safari Private Browsing may reject IndexedDB/localStorage at init */
    }
  }
  const instance = initializeAuth(app, {
    persistence: inMemoryPersistence,
    popupRedirectResolver: browserPopupRedirectResolver,
  });
  socialAuthDebug('AUTH_PERSISTENCE_READY', { persistence: 'inMemory', phase: 'init-fallback' });
  return instance;
}

let persistenceAppliedAfterRedirect = false;

/**
 * browserLocal → indexedDB → session → in-memory (Private Browsing safe).
 * Do NOT call this before getRedirectResult on an OAuth return — WebKit can drop the pending redirect.
 */
export async function applyAuthPersistenceSafely(instance) {
  try {
    await setPersistence(instance, browserLocalPersistence);
    socialAuthDebug('AUTH_PERSISTENCE_READY', { persistence: 'browserLocal', phase: 'setPersistence' });
    authRecoveryLog('Persistence applied', {
      persistence: 'browserLocal',
      safari: isMobileWebSafari(),
    });
    persistenceAppliedAfterRedirect = true;
    return 'browserLocal';
  } catch {
    /* fall through to chain */
  }
  const chain = persistenceChainForInit().filter((p) => p !== browserLocalPersistence);
  for (const persistence of chain) {
    try {
      await setPersistence(instance, persistence);
      const label = persistenceLabel(persistence);
      socialAuthDebug('AUTH_PERSISTENCE_READY', { persistence: label, phase: 'setPersistence' });
      authRecoveryLog('Persistence applied', {
        persistence: label,
        safari: isMobileWebSafari(),
      });
      persistenceAppliedAfterRedirect = true;
      return label;
    } catch {
      /* try next */
    }
  }
  await setPersistence(instance, inMemoryPersistence);
  socialAuthDebug('AUTH_PERSISTENCE_READY', { persistence: 'inMemory', phase: 'setPersistence-fallback' });
  persistenceAppliedAfterRedirect = true;
  return 'inMemory';
}

/** Apply persistence after a successful redirect recovery (safe once getRedirectResult has run). */
export async function applyAuthPersistenceAfterRedirectRecovery(instance) {
  if (persistenceAppliedAfterRedirect) return;
  return applyAuthPersistenceSafely(instance);
}

export function getSocialAuth() {
  assertFirebaseOAuthEnvironment();

  const config = buildFirebaseClientConfig();
  const missing = Object.entries({
    apiKey: config.apiKey,
    authDomain: config.authDomain,
    projectId: config.projectId,
    appId: config.appId,
  })
    .filter(([, value]) => !isUsableFirebaseConfigValue(value))
    .map(([field]) => CONFIG_ENV_KEYS[field] || field);

  if (missing.length) {
    throw new Error(
      `Google sign-in is not configured. Set ${missing.join(', ')} in frontend/.env or server FIREBASE_WEB_* variables, then restart.`,
    );
  }

  const existingApp = getApps().find((item) => item.name === 'allmodelai-social');
  if (existingApp && existingApp.options.authDomain !== config.authDomain) {
    socialAuthDebug('AUTH_DOMAIN_MISMATCH', {
      expected: config.authDomain,
      actual: existingApp.options.authDomain,
    });
    throw new Error('AUTH_DOMAIN_MISMATCH');
  }

  if (!socialAuthInstance) {
    const app = existingApp || initializeApp(config, 'allmodelai-social');
    socialAuthInstance = initializeSocialAuth(app);
  }
  return socialAuthInstance;
}

async function reconcileFirebaseAppAuthDomain() {
  const config = buildFirebaseClientConfig();
  const existingApp = getApps().find((item) => item.name === 'allmodelai-social');
  if (!existingApp || existingApp.options.authDomain === config.authDomain) {
    return;
  }
  socialAuthDebug('AUTH_DOMAIN_MISMATCH', {
    expected: config.authDomain,
    actual: existingApp.options.authDomain,
  });
  socialAuthInstance = null;
  await deleteApp(existingApp);
}

let authReadyPromise = null;

/**
 * Load public Firebase config and init auth once.
 * On Google redirect return, skip setPersistence until after getRedirectResult (Safari/WebKit).
 */
export async function ensureSocialAuthReady() {
  if (authReadyPromise) {
    return authReadyPromise;
  }

  authReadyPromise = (async () => {
    const { ensureFirebaseSocialConfigLoaded } = await import('./loadFirebaseConfig.js');
    await ensureFirebaseSocialConfigLoaded();
    await reconcileFirebaseAppAuthDomain();
    const instance = getSocialAuth();
    const authDomain = getEffectiveFirebaseConfig().authDomain;
    if (
      import.meta.env?.DEV
      || import.meta.env?.VITE_FIREBASE_CUSTOM_AUTH_DOMAIN === 'true'
      || isMobileWebSafari()
    ) {
      console.info('[AllModelAI:Firebase] authDomain', authDomain);
    }
    socialAuthDebug('FIREBASE_AUTH_DOMAIN_READY', { authDomain });
    if (
      import.meta.env?.PROD
      && isFirebaseAuthProxyHostname(hostedSiteAuthDomain())
      && isFirebaseAppDomain(authDomain)
    ) {
      console.warn(
        '[AllModelAI:Firebase] Production OAuth is still using a *.firebaseapp.com authDomain. '
        + 'Redeploy with VITE_FIREBASE_AUTH_DOMAIN=all-model-ai.com and hard-refresh (clear PWA cache if needed).',
      );
    }

    // Critical: setPersistence before getRedirectResult clears pending OAuth on iPad/iPhone Safari.
    if (shouldAttemptGoogleRedirectRecovery()) {
      socialAuthDebug('AUTH_PERSISTENCE_DEFERRED', { reason: 'redirect-recovery-pending' });
      authRecoveryLog('Deferring setPersistence until after getRedirectResult', {
        safari: isMobileWebSafari(),
        authDomain,
      });
    } else {
      await applyAuthPersistenceSafely(instance);
    }
    return instance;
  })().catch((error) => {
    authReadyPromise = null;
    throw error;
  });

  return authReadyPromise;
}

export function resetSocialAuthReadyForTests() {
  authReadyPromise = null;
  persistenceAppliedAfterRedirect = false;
  socialAuthInstance = null;
}
