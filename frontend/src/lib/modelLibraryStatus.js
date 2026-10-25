import { resolveModelOnlineStatus } from '../data/ollamaCloudVariants.js';

/**
 * Model Library card status — configuration (env) vs live availability when backend exposes modelHealth.
 */
export function resolveModelLibraryCardStatus(slug, modelStatus = {}, modelHealth = {}) {
  if (slug === 'smart') {
    return { label: 'Auto route', className: 'neutral' };
  }
  if (!Object.keys(modelStatus || {}).length) {
    return { label: 'Checking…', className: 'pending' };
  }

  const health = modelHealth?.[slug];
  if (health?.status === 'setup_needed') {
    return { label: 'Setup needed', className: 'offline' };
  }
  if (health?.status === 'available') {
    return { label: 'Available', className: '' };
  }
  if (health?.status === 'unavailable') {
    return { label: 'Unavailable', className: 'offline' };
  }
  if (health?.status === 'configured') {
    return { label: 'Configured', className: '' };
  }

  const configured = resolveModelOnlineStatus(slug, modelStatus);
  return configured
    ? { label: 'Configured', className: '' }
    : { label: 'Setup needed', className: 'offline' };
}
