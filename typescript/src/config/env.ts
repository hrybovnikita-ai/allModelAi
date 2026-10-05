/** Typed helpers for non-secret configuration (never read API keys here for frontend). */

export interface BackendServiceEnv {
  apiBaseUrl: string;
  aiPythonBaseUrl: string;
}

export interface ContractsEnvOptions {
  apiBaseUrl?: string;
  aiPythonPort?: string | number;
  /** Node/process or Vite import.meta.env bag */
  env?: Record<string, string | undefined>;
}

function trimUrl(value: string | undefined): string {
  return String(value || '').trim().replace(/\/$/, '');
}

/**
 * Resolve backend API base URL without hardcoding production hosts.
 * Prefer explicit API_BASE_URL / VITE_API_BASE_URL, then browser origin, then localhost dev default.
 */
export function resolveBackendApiBaseUrl(options: ContractsEnvOptions = {}): string {
  const bag = options.env ?? {};
  const explicit =
    trimUrl(bag.API_BASE_URL)
    || trimUrl(bag.VITE_API_BASE_URL)
    || trimUrl(bag.PUBLIC_URL)
    || trimUrl(options.apiBaseUrl);

  if (explicit) {
    return explicit;
  }

  if (typeof globalThis !== 'undefined') {
    const loc = (globalThis as { location?: { origin?: string } }).location;
    if (loc?.origin) {
      return loc.origin;
    }
  }

  return 'http://127.0.0.1:5050';
}

export function resolveAiPythonBaseUrl(options: ContractsEnvOptions = {}): string {
  const bag = options.env ?? {};
  const explicit = trimUrl(bag.AI_PYTHON_BASE_URL);
  if (explicit) {
    return explicit;
  }
  const port = String(options.aiPythonPort ?? bag.AI_PYTHON_PORT ?? '5055').trim();
  return `http://127.0.0.1:${port}`;
}

export function readBackendServiceEnv(options: ContractsEnvOptions = {}): BackendServiceEnv {
  return {
    apiBaseUrl: resolveBackendApiBaseUrl(options),
    aiPythonBaseUrl: resolveAiPythonBaseUrl(options),
  };
}
