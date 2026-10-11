import { apiFetch } from './api';

export async function fetchPlatformCapabilities() {
  const response = await apiFetch('/api/platform/capabilities');
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || 'Could not load platform capabilities.');
  }
  return data;
}

export async function fetchPlatformJobs() {
  const response = await apiFetch('/api/platform/jobs');
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || 'Could not load platform jobs.');
  }
  return data.jobs || [];
}
