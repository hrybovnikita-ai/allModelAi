/** Canonical virtual chat slug is `anonin` (display name: Anonin Model). */
export const ANONIN_MODEL_SLUG = 'anonin';

export function normalizeAnoninModelSlug(slug) {
  const key = String(slug || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (
    key === 'anonim'
    || key === 'anonymous'
    || key === 'anonin'
    || key === 'anonin model'
    || key === 'anonin-model'
    || key === 'anonin_model'
  ) {
    return ANONIN_MODEL_SLUG;
  }
  return String(slug || '').trim().toLowerCase();
}

export function isAnoninModelSlug(slug) {
  return normalizeAnoninModelSlug(slug) === ANONIN_MODEL_SLUG;
}
