import { initializeApp, getApps } from 'firebase/app';
import { initializeAuth, inMemoryPersistence, browserPopupRedirectResolver } from 'firebase/auth';

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

export function getSocialAuth() {
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
