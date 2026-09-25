import { apiFetch } from './api';

export const IMAGE_STYLES = [
  { id: 'auto', label: 'Auto' },
  { id: 'photorealistic', label: 'Photorealistic' },
  { id: 'cinematic', label: 'Cinematic' },
  { id: 'anime', label: 'Anime' },
  { id: 'digital-art', label: 'Digital Art' },
  { id: '3d', label: '3D' },
];

export const IMAGE_ASPECTS = [
  { id: '1:1', label: '1:1' },
  { id: '16:9', label: '16:9' },
  { id: '9:16', label: '9:16' },
];

export const IMAGE_QUALITIES = [
  { id: 'standard', label: 'Standard' },
  { id: 'high', label: 'High' },
];

export async function fetchImageGenerationStatus() {
  const response = await apiFetch('/api/images/status');
  if (!response.ok) {
    return { configured: false, provider: 'none', pollinations: false, model: null };
  }
  return response.json();
}

export function imageProviderLabel(status) {
  if (!status?.configured) return null;
  if (status.provider === 'pollinations') {
    return `Pollinations · ${status.model || 'flux'}`;
  }
  if (status.provider === 'cloudflare') return 'Cloudflare Workers AI';
  if (status.provider === 'openai') return `OpenAI · ${status.model || 'image'}`;
  return null;
}

export function buildImageRequestBody({
  prompt,
  style = 'auto',
  aspectRatio = '1:1',
  quality = 'standard',
  basePrompt = '',
  editInstruction = '',
}) {
  const body = {
    prompt: String(prompt || '').trim(),
    style,
    aspectRatio,
    quality,
  };
  if (basePrompt) body.basePrompt = String(basePrompt).trim();
  if (editInstruction) body.editInstruction = String(editInstruction).trim();
  return body;
}

export async function requestImageGeneration(body, signal) {
  const response = await apiFetch('/api/images', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  return response;
}
