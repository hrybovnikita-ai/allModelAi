import { initializeApp, getApps } from 'firebase/app';
import {
  initializeAuth,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  inMemoryPersistence,
  browserPopupRedirectResolver,
  setPersistence,
} from 'firebase/auth';
import { ensureFirebaseSocialConfigLoaded } from './loadFirebaseConfig.js';
import { getBrowserApiOrigin, getPublicAppOrigin, isHostedWebApp } from './apiBase.js';
import { isIosTouchDevice, isMobileWebSafari } from './socialSignInEnv.js';
import { authRecoveryLog, socialAuthDebug } from './socialAuthDiagnostics.js';
import {
  DEFAULT_FIREBASE_AUTH_DOMAIN,
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
let auth;

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

/** When true, use the live site hostname as authDomain (requires Vercel /__/auth → firebaseapp.com proxy). */
export function isCustomAuthDomainEnabled() {
  return import.meta.env?.VITE_FIREBASE_CUSTOM_AUTH_DOMAIN === 'true';
}

function hostedSiteAuthDomain() {
  if (typeof window === 'undefined' || !isHostedWebApp()) return '';
  const origin = getBrowserApiOrigin();
  if (!origin) return '';
  try {
    return new URL(origin).hostname;
  } catch {
    return '';
  }
}

/**
 * authDomain must match where /__/auth/handler is served (custom domain + proxy, or *.firebaseapp.com).
 * Default: VITE_FIREBASE_AUTH_DOMAIN=allmodelai.firebaseapp.com (recommended for popup/redirect sign-in).
 * Custom site domain only when VITE_FIREBASE_CUSTOM_AUTH_DOMAIN=true and /__/auth is proxied on that host.
 */
/** iOS WebKit loses cross-site Firebase redirect state; use first-party /__/auth on the live site. */
export function shouldPreferHostedFirebaseAuthDomain() {
  if (typeof window === 'undefined' || !isHostedWebApp()) return false;
  const hosted = hostedSiteAuthDomain();
  if (!hosted || /localhost|127\.0\.0\.1/i.test(hosted)) return false;
  return isMobileWebSafari() || isIosTouchDevice();
}

export function resolveAuthDomainForRuntime(configuredAuthDomain) {
  const viteEnv = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : {};
  const hosted = hostedSiteAuthDomain();
  if (shouldPreferHostedFirebaseAuthDomain() && hosted) {
    return hosted;
  }
  const customAuth = isCustomAuthDomainEnabled();
  return resolveAuthDomainCore(configuredAuthDomain, {
    envAuthDomain: readFirebaseAuthDomainFromEnv(viteEnv),
    customAuthDomainEnabled: customAuth,
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
  if (!isUsableFirebaseConfigValue(merged.authDomain)) {
    merged.authDomain = DEFAULT_FIREBASE_AUTH_DOMAIN;
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

/** browserLocal → indexedDB → session → in-memory (Private Browsing safe). */
export async function applyAuthPersistenceSafely(instance) {
  try {
    await setPersistence(instance, browserLocalPersistence);
    socialAuthDebug('AUTH_PERSISTENCE_READY', { persistence: 'browserLocal', phase: 'setPersistence' });
    authRecoveryLog('Persistence ready before redirect checks', {
      persistence: 'browserLocal',
      safari: isMobileWebSafari(),
    });
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
      authRecoveryLog('Persistence ready before redirect checks', {
        persistence: label,
        safari: isMobileWebSafari(),
      });
      return label;
    } catch {
      /* try next */
    }
  }
  await setPersistence(instance, inMemoryPersistence);
  socialAuthDebug('AUTH_PERSISTENCE_READY', { persistence: 'inMemory', phase: 'setPersistence-fallback' });
  return 'inMemory';
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

  if (!auth) {
    const app = getApps().find((item) => item.name === 'allmodelai-social')
      || initializeApp(config, 'allmodelai-social');
    auth = initializeSocialAuth(app);
  }
  return auth;
}

let authReadyPromise = null;

/** Load public Firebase config, init auth once, set Safari-friendly persistence before redirect/recovery. */
export async function ensureSocialAuthReady() {
  if (authReadyPromise) {
    return authReadyPromise;
  }

  authReadyPromise = (async () => {
    await ensureFirebaseSocialConfigLoaded();
    const instance = getSocialAuth();
    if (import.meta.env?.DEV || import.meta.env?.VITE_FIREBASE_CUSTOM_AUTH_DOMAIN === 'true') {
      console.info('[AllModelAI:Firebase] authDomain', getEffectiveFirebaseConfig().authDomain);
    }
    await applyAuthPersistenceSafely(instance);
    return instance;
  })().catch((error) => {
    authReadyPromise = null;
    throw error;
  });

  return authReadyPromise;
}

export function resetSocialAuthReadyForTests() {
  authReadyPromise = null;
}
