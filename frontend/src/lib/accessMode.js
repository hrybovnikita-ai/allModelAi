import { apiFetch } from './api';

export function ownerPlusActive(creditStatus) {
  if (!creditStatus?.isOwner) return false;
  return creditStatus.plusActive === true || creditStatus.mode === 'developer';
}

export async function patchAccessMode(mode) {
  const response = await apiFetch('/api/access-mode', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || 'Could not change access mode.');
  }
  return data;
}
