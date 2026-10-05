export function isSafeHttpUrl(url) {
  try {
    const parsed = new URL(String(url || '').trim());
    return /^https?:$/i.test(parsed.protocol);
  } catch {
    return false;
  }
}

export function buildCitationSourceMap(sources = []) {
  const map = new Map();
  sources.forEach((source) => {
    const id = Number(source.citationId ?? source.rank);
    if (!Number.isFinite(id) || id <= 0) return;
    map.set(id, source);
  });
  return map;
}

/**
 * Split text into alternating prose and [n] citation tokens.
 */
export function splitCitationSegments(text) {
  return String(text || '').split(/(\[\d+\])/g).filter((part) => part.length > 0);
}

export function scrollToSourceCard(citationId) {
  const el = globalThis.document?.getElementById(`web-source-${citationId}`);
  el?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
}
