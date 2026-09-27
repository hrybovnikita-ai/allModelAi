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

/** English labels for Storage Hub (UI always English). */
export const STORAGE_IDEA_LABELS = {
  'chat-history': {
    title: 'Chat history',
    description: 'Saved conversations with models on your account.',
  },
  'favorite-prompts': {
    title: 'Favorite prompts',
    description: 'Useful prompts you can quickly paste into chat.',
  },
  'chat-settings': {
    title: 'Chat settings',
    description: 'Default model, temperature, and router mode.',
  },
  'builder-projects': {
    title: 'Builder projects',
    description: 'Website and app drafts from Website Builder.',
  },
  'usage-daily': {
    title: 'Daily usage',
    description: 'How many AI requests you sent each day.',
  },
  'model-bookmarks': {
    title: 'Model bookmarks',
    description: 'Frequently used models in one list.',
  },
  attachments: {
    title: 'Message attachments',
    description: 'Files and notes linked to conversations.',
  },
  'training-runs': {
    title: 'Training log',
    description: 'PyTorch AI Lab runs with metrics.',
  },
};

export function withEnglishStorageLabels(idea) {
  if (!idea?.id) return idea;
  const labels = STORAGE_IDEA_LABELS[idea.id];
  if (!labels) return idea;
  return { ...idea, title: labels.title, description: labels.description };
}
