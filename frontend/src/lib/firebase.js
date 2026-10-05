import { initializeApp, getApps } from 'firebase/app';
import {
  initializeAuth,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  browserPopupRedirectResolver,
  setPersistence,
} from 'firebase/auth';
import { ensureFirebaseSocialConfigLoaded } from './loadFirebaseConfig.js';
import { getPublicAppOrigin } from './apiBase.js';

const CONFIG_ENV_KEYS = {
  apiKey: 'VITE_FIREBASE_API_KEY',
  authDomain: 'VITE_FIREBASE_AUTH_DOMAIN',
  projectId: 'VITE_FIREBASE_PROJECT_ID',
  appId: 'VITE_FIREBASE_APP_ID',
};

const BUILTIN_PRODUCTION_HOSTS = new Set([
  'all-model-ai.com',
  'www.all-model-ai.com',
]);

let runtimeFirebaseConfig = null;
let auth;

function readViteFirebaseEnv() {
  const viteEnv = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : {};
  return {
    apiKey: viteEnv.VITE_FIREBASE_API_KEY,
    authDomain: viteEnv.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: viteEnv.VITE_FIREBASE_PROJECT_ID,
    appId: viteEnv.VITE_FIREBASE_APP_ID,
  };
}

export function isUsableFirebaseConfigValue(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return false;
  if (/^(your[-_]?|replace|changeme|xxx+|test)$/i.test(trimmed)) return false;
  if (/^your[-_]?(project|firebase|api|app)[-_]?/i.test(trimmed)) return false;
  return true;
}

function pickField(envValue, runtimeValue) {
  if (isUsableFirebaseConfigValue(envValue)) return String(envValue).trim();
  if (isUsableFirebaseConfigValue(runtimeValue)) return String(runtimeValue).trim();
  return '';
}

function hostnameFromPublicUrl() {
  try {
    const origin = getPublicAppOrigin();
    if (!origin) return '';
    return new URL(origin).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * Safari redirect sign-in needs first-party authDomain (custom domain), not *.firebaseapp.com.
 */
export function resolveAuthDomainForRuntime(configuredAuthDomain) {
  const configured = String(configuredAuthDomain || '').trim();
  if (typeof window === 'undefined') return configured;

  const host = window.location.hostname.toLowerCase();
  const onProductionHost = BUILTIN_PRODUCTION_HOSTS.has(host)
    || host.endsWith('.all-model-ai.com');

  if (!onProductionHost) {
    return configured;
  }

  const viteEnv = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : {};
  const envDomain = String(viteEnv.VITE_FIREBASE_AUTH_DOMAIN || '').trim();
  if (envDomain && !envDomain.includes('firebaseapp.com') && !envDomain.includes('web.app')) {
    return envDomain.replace(/^www\./, '');
  }

  if (configured && !configured.includes('firebaseapp.com') && !configured.includes('web.app')) {
    return configured.replace(/^www\./, '');
  }

  const fromPublicUrl = hostnameFromPublicUrl();
  if (fromPublicUrl && !fromPublicUrl.includes('firebaseapp.com')) {
    return fromPublicUrl.replace(/^www\./, '');
  }

  if (host === 'www.all-model-ai.com' || host === 'all-model-ai.com') {
    return 'all-model-ai.com';
  }

  return configured;
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

  if (import.meta.env?.DEV) {
    const config = getEffectiveFirebaseConfig();
    const appHost = window.location.hostname;
    if (config.authDomain && appHost && config.authDomain !== appHost && !appHost.endsWith(config.authDomain)) {
      console.info(
        `[AllModelAI] Firebase authDomain=${config.authDomain} appHost=${appHost}. `
        + 'For Safari redirect sign-in, authDomain should match your custom domain when hosted on Firebase/custom auth.',
      );
    }
  }
}

function stripPublicOrigin(value) {
  try {
    return String(value || '').replace(/\/$/, '');
  } catch {
    return '';
  }
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
    auth = initializeAuth(app, {
      persistence: indexedDBLocalPersistence,
      popupRedirectResolver: browserPopupRedirectResolver,
    });
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
    try {
      await setPersistence(instance, indexedDBLocalPersistence);
    } catch {
      await setPersistence(instance, browserLocalPersistence);
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
}
