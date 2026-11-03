import {
  CLERK_TEST_PATH,
  clerkPublishableKey,
  isClerkPublishableKeyConfigured,
  isClerkTestRouteEnabled,
} from './clerkTestConfig.js';
import { clerkAuthPasswordLocalization } from './clerkPasswordPolicy.js';

export {
  CLERK_TEST_PATH,
  clerkPublishableKey,
  isClerkPublishableKeyConfigured,
  isClerkTestRouteEnabled,
};

/** Client feature flag — must match backend CLERK_AUTH_ENABLED for exchange to work. */
export function isClerkMainAuthEnvEnabled(env = import.meta.env || {}) {
  return String(env.VITE_CLERK_AUTH_ENABLED || '').trim().toLowerCase() === 'true';
}

export function isClerkMainAuthClientReady(env = import.meta.env || {}) {
  return isClerkMainAuthEnvEnabled(env) && isClerkPublishableKeyConfigured(env);
}

/** Localization overrides for Clerk embedded auth (password hints stay simple; Clerk API still validates). */
export function clerkAuthLocalization() {
  return clerkAuthPasswordLocalization();
}

/** Compact dark/violet styling for Clerk embedded in the AllModelAI modal. */
export function clerkAuthAppearance() {
  return {
    layout: {
      socialButtonsPlacement: 'top',
      socialButtonsVariant: 'blockButton',
    },
    variables: {
      colorPrimary: '#7C3AED',
      colorPrimaryForeground: '#ffffff',
      colorBackground: 'transparent',
      colorInputBackground: 'rgba(0, 0, 0, 0.55)',
      colorInputText: '#ffffff',
      colorText: '#ffffff',
      colorTextSecondary: '#A78BFA',
      colorDanger: '#f87171',
      colorNeutral: '#A78BFA',
      borderRadius: '12px',
      fontFamily: 'inherit',
      fontSize: '0.9rem',
      spacingUnit: '0.7rem',
    },
    elements: {
      rootBox: {
        width: '100%',
        maxWidth: '100%',
      },
      cardBox: {
        width: '100%',
        maxWidth: '100%',
        boxShadow: 'none',
        margin: '0',
      },
      card: {
        width: '100%',
        maxWidth: '100%',
        background: 'transparent',
        boxShadow: 'none',
        border: '0',
        padding: '0',
        gap: '0.75rem',
      },
      main: {
        gap: '0.75rem',
        padding: '0',
      },
      header: { display: 'none' },
      logoBox: { display: 'none' },
      logoImage: { display: 'none' },
      footer: { display: 'none' },
      footerAction: { display: 'none' },
      identityPreview: {
        background: 'rgba(0, 0, 0, 0.55)',
        borderColor: 'rgba(167, 139, 250, 0.35)',
        borderRadius: '12px',
      },
      form: {
        gap: '0.7rem',
      },
      formFieldLabel: {
        color: '#A78BFA',
      },
      formFieldInput: {
        height: '48px',
        borderRadius: '12px',
        borderColor: 'rgba(167, 139, 250, 0.35)',
        backgroundColor: 'rgba(0, 0, 0, 0.55)',
      },
      formButtonPrimary: {
        height: '48px',
        borderRadius: '15px',
        background: '#7C3AED',
        boxShadow: 'none',
      },
      socialButtonsBlockButton: {
        height: '48px',
        borderRadius: '15px',
        border: '1px solid rgba(167, 139, 250, 0.35)',
        background: 'rgba(0, 0, 0, 0.45)',
        color: '#ffffff',
      },
      dividerLine: {
        background: 'rgba(167, 139, 250, 0.28)',
      },
      dividerText: {
        color: '#A78BFA',
      },
      alert: {
        borderRadius: '12px',
      },
    },
  };
}

let clerkStatusCache = null;
let clerkStatusInflight = null;

/** Whether the backend accepts Clerk session exchange (no secrets returned). */
export async function fetchClerkAuthBackendEnabled() {
  if (clerkStatusCache !== null) return clerkStatusCache;
  if (clerkStatusInflight) return clerkStatusInflight;
  clerkStatusInflight = (async () => {
    try {
      const { resolveApiUrl } = await import('./apiBase.js');
      const response = await fetch(resolveApiUrl('/api/public/clerk-auth'), {
        credentials: 'include',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout
          ? AbortSignal.timeout(8000)
          : undefined,
      });
      if (!response.ok) {
        clerkStatusCache = false;
        return false;
      }
      const data = await response.json();
      clerkStatusCache = Boolean(data?.enabled);
      return clerkStatusCache;
    } catch {
      clerkStatusCache = false;
      return false;
    } finally {
      clerkStatusInflight = null;
    }
  })();
  return clerkStatusInflight;
}

export function resetClerkAuthStatusCache() {
  clerkStatusCache = null;
}

export const CLERK_SESSION_MARKER_KEY = 'allmodelai_clerk_session';
