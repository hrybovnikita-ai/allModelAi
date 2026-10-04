import { initializeApp, getApps } from 'firebase/app';
import { initializeAuth, inMemoryPersistence, browserPopupRedirectResolver } from 'firebase/auth';
import { getPublicAppOrigin } from './apiBase.js';

const CONFIG_ENV_KEYS = {
  apiKey: 'VITE_FIREBASE_API_KEY',
  authDomain: 'VITE_FIREBASE_AUTH_DOMAIN',
  projectId: 'VITE_FIREBASE_PROJECT_ID',
  appId: 'VITE_FIREBASE_APP_ID',
};

const viteEnv = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : {};

// Public web configuration only. Admin credentials must never have a VITE_ prefix.
const config = {
  apiKey: viteEnv.VITE_FIREBASE_API_KEY,
  authDomain: viteEnv.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: viteEnv.VITE_FIREBASE_PROJECT_ID,
  appId: viteEnv.VITE_FIREBASE_APP_ID,
};

let auth;

export function getFirebaseConfigEnvKeys() {
  return { ...CONFIG_ENV_KEYS };
}

/** True when all VITE_FIREBASE_* web config values required for social sign-in are set. */
export function isFirebaseSocialConfigured() {
  return Object.values(config).every((value) => String(value || '').trim());
}

/** Origin Firebase OAuth runs on (current tab, not a hardcoded deploy URL). */
export function getFirebaseOAuthOrigin() {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return getPublicAppOrigin();
}

/**
 * Ensures OAuth uses the live page origin and surfaces preview/custom-domain setup hints.
 */
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

  const missing = Object.entries(config)
    .filter(([, value]) => !String(value || '').trim())
    .map(([key]) => CONFIG_ENV_KEYS[key] || key);

  if (missing.length) {
    throw new Error(
      `Social sign-in is not configured. Add ${missing.join(', ')} to your Vercel project environment variables, then redeploy the frontend production build.`,
    );
  }

  if (!auth) {
    const app = getApps().find((item) => item.name === 'allmodelai-social')
      || initializeApp(config, 'allmodelai-social');
    // Firebase only proves identity; AllModelAI keeps the durable HttpOnly session.
    auth = initializeAuth(app, {
      persistence: inMemoryPersistence,
      popupRedirectResolver: browserPopupRedirectResolver,
    });
  }
  return auth;
}
