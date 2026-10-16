/**
 * Presentation helpers for past provider/config errors stored in chat history.
 * Never mutates message text — only classifies and labels for UI.
 */

const HISTORICAL_CONFIG_PATTERNS = [
  /OLLAMA_CLOUD_NOT_CONFIGURED/i,
  /Ollama Cloud is not configured/i,
  /Set OLLAMA_API_KEY/i,
  /OLLAMA_CLOUD_AUTH_FAILED/i,
  /CLOUDFLARE_GPT_OSS_NOT_CONFIGURED/i,
  /GEMINI_NOT_CONFIGURED/i,
  /is not configured on the server/i,
  /is not configured on this backend/i,
];

export function isHistoricalProviderConfigError(text = '') {
  const value = String(text || '');
  if (!value.trim()) return false;
  return HISTORICAL_CONFIG_PATTERNS.some((pattern) => pattern.test(value));
}

/**
 * @returns {{ kind: 'ollama_config' | 'provider_config' | null, notice: string | null }}
 */
export function historicalProviderErrorPresentation(text = '', { ollamaConfigured = false } = {}) {
  const value = String(text || '');
  if (!isHistoricalProviderConfigError(value)) {
    return { kind: null, notice: null };
  }
  const isOllama = /ollama/i.test(value) || /OLLAMA_/i.test(value);
  if (isOllama) {
    return {
      kind: 'ollama_config',
      notice: ollamaConfigured
        ? 'Historical configuration error — Ollama Cloud is configured now. You can send a new message.'
        : 'Historical configuration error — Ollama Cloud was not available when this reply was saved.',
    };
  }
  return {
    kind: 'provider_config',
    notice: 'Historical configuration error — this reply was saved when the provider was unavailable.',
  };
}
