import { apiFetch } from './api';

const json = async (response) => {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || 'Storage request failed');
  }
  return data;
};

export const fetchStorageOverview = () =>
  apiFetch('/api/storage/ideas').then(json);

export const fetchStorageIdea = (idea) =>
  apiFetch(`/api/storage/ideas/${encodeURIComponent(idea)}`).then(json);

export const createStorageIdea = (idea, body) =>
  apiFetch(`/api/storage/ideas/${encodeURIComponent(idea)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(json);

export const deleteStorageIdea = (idea, id) =>
  apiFetch(`/api/storage/ideas/${encodeURIComponent(idea)}/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  }).then(json);

export const STORAGE_IDEA_IDS = [
  'chat-history',
  'favorite-prompts',
  'chat-settings',
  'builder-projects',
  'usage-daily',
  'model-bookmarks',
  'attachments',
  'training-runs',
];
