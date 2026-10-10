import { apiFetch } from './api';

export async function fetchMemorySettings() {
  const response = await apiFetch('/api/ai/memory/settings');
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || 'Could not load memory settings.');
  }
  return response.json();
}

export async function updateMemorySettings(patch) {
  const response = await apiFetch('/api/ai/memory/settings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'Could not update memory settings.');
  return data;
}

export async function fetchUserMemories() {
  const response = await apiFetch('/api/ai/memory');
  if (!response.ok) throw new Error('Could not load memories.');
  const data = await response.json();
  return data.items || [];
}

export async function createUserMemory(content, { conversationId } = {}) {
  const response = await apiFetch('/api/ai/memory', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, conversationId }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'Could not save memory.');
  return data;
}

export async function updateUserMemory(id, content) {
  const response = await apiFetch(`/api/ai/memory/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'Could not update memory.');
  return data;
}

export async function deleteUserMemory(id) {
  const response = await apiFetch(`/api/ai/memory/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!response.ok) throw new Error('Could not delete memory.');
}

export async function clearAllUserMemories() {
  const response = await apiFetch('/api/ai/memory', { method: 'DELETE' });
  if (!response.ok) throw new Error('Could not clear memories.');
}

export async function submitResponseFeedback(payload) {
  const response = await apiFetch('/api/ai/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || 'Could not save feedback.');
  }
  return response.json();
}
