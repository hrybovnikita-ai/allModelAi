export function isUsableFirebaseConfigValue(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return false;
  if (/^(your[-_]?|replace|changeme|xxx+|test)$/i.test(trimmed)) return false;
  if (/^your[-_]?(project|firebase|api|app)[-_]?/i.test(trimmed)) return false;
  return true;
}

/**
 * @param {string} configuredAuthDomain
 * @param {{ envAuthDomain?: string, customAuthDomainEnabled?: boolean, hostedHostname?: string }} [options]
 */
export function resolveAuthDomainForRuntime(configuredAuthDomain, options = {}) {
  const configured = String(configuredAuthDomain || '').trim();
  const envDomain = String(options.envAuthDomain || '').trim();

  if (isUsableFirebaseConfigValue(envDomain)) {
    return envDomain;
  }

  if (options.customAuthDomainEnabled) {
    const hosted = String(options.hostedHostname || '').trim();
    if (hosted) return hosted;
  }

  return configured;
}
