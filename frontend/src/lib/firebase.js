import { initializeApp, getApps } from 'firebase/app';
import { initializeAuth, inMemoryPersistence, browserPopupRedirectResolver } from 'firebase/auth';
import { getPublicAppOrigin } from './apiBase.js';

const CONFIG_ENV_KEYS = {
  apiKey: 'VITE_FIREBASE_API_KEY',
  authDomain: 'VITE_FIREBASE_AUTH_DOMAIN',
  projectId: 'VITE_FIREBASE_PROJECT_ID',
  appId: 'VITE_FIREBASE_APP_ID',
};

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

export function getEffectiveFirebaseConfig() {
  const fromEnv = readViteFirebaseEnv();
  const runtime = runtimeFirebaseConfig || {};
  return {
    apiKey: pickField(fromEnv.apiKey, runtime.apiKey),
    authDomain: pickField(fromEnv.authDomain, runtime.authDomain),
    projectId: pickField(fromEnv.projectId, runtime.projectId),
    appId: pickField(fromEnv.appId, runtime.appId),
  };
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

export function getSocialAuth() {
  assertFirebaseOAuthEnvironment();

  const config = getEffectiveFirebaseConfig();
  const missing = getMissingFirebaseConfigKeys();

  if (missing.length) {
    throw new Error(
      `Google sign-in is not configured. Set ${missing.join(', ')} in frontend/.env or server FIREBASE_WEB_* variables, then restart.`,
    );
  }

  if (!auth) {
    const app = getApps().find((item) => item.name === 'allmodelai-social')
      || initializeApp(config, 'allmodelai-social');
    auth = initializeAuth(app, {
      persistence: inMemoryPersistence,
      popupRedirectResolver: browserPopupRedirectResolver,
    });
  }
  return auth;
}
