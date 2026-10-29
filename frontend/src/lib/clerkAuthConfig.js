import {
  CLERK_TEST_PATH,
  clerkPublishableKey,
  isClerkPublishableKeyConfigured,
  isClerkTestRouteEnabled,
} from './clerkTestConfig.js';

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

/** Compact dark/violet styling for Clerk embedded in the AllModelAI modal. */
export function clerkAuthAppearance() {
  return {
    layout: {
      socialButtonsPlacement: 'top',
      socialButtonsVariant: 'blockButton',
    },
    variables: {
      colorPrimary: '#8b5cf6',
      colorPrimaryForeground: '#ffffff',
      colorBackground: 'transparent',
      colorInputBackground: 'rgba(15, 23, 42, 0.88)',
      colorInputText: '#ffffff',
      colorText: '#f8fafc',
      colorTextSecondary: '#94a3b8',
      colorDanger: '#f87171',
      colorNeutral: '#64748b',
      borderRadius: '10px',
      fontFamily: 'inherit',
      fontSize: '0.9rem',
      spacingUnit: '0.75rem',
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
        background: 'rgba(15, 23, 42, 0.88)',
        borderColor: '#334155',
      },
      form: {
        gap: '0.75rem',
      },
      formFieldInput: {
        height: '2.75rem',
        borderColor: '#334155',
      },
      formButtonPrimary: {
        height: '2.75rem',
        background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
        boxShadow: '0 10px 24px rgba(99, 102, 241, 0.28)',
      },
      socialButtonsBlockButton: {
        height: '2.75rem',
        border: '1px solid #334155',
        background: 'rgba(15, 23, 42, 0.88)',
        color: '#ffffff',
      },
      dividerLine: {
        background: 'rgba(148, 163, 184, 0.28)',
      },
      dividerText: {
        color: '#64748b',
      },
      alert: {
        borderRadius: '10px',
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
