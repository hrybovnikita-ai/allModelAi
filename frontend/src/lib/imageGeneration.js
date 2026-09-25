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
  { id: '1:1', label: 'Square (1:1)' },
  { id: '16:9', label: 'Landscape (16:9)' },
  { id: '9:16', label: 'Portrait (9:16)' },
];

export const IMAGE_QUALITIES = [
  { id: 'standard', label: 'Standard' },
  { id: 'hd', label: 'HD' },
  { id: 'ultra', label: 'Ultra' },
];

export const QUALITY_LABELS = {
  standard: 'Standard',
  hd: 'HD',
  ultra: 'Ultra',
  high: 'HD',
};

export const ASPECT_LABELS = {
  '1:1': 'Square (1:1)',
  '16:9': 'Landscape (16:9)',
  '9:16': 'Portrait (9:16)',
};

export async function fetchImageGenerationStatus() {
  const response = await apiFetch('/api/images/status');
  if (!response.ok) {
    return { configured: false, provider: 'none', pollinations: false, model: null };
  }
  return response.json();
}

export function imageProviderLabel(status, quality = 'hd') {
  if (!status?.configured) return null;
  const model = status.qualityModels?.[quality] || status.model;
  if (status.provider === 'pollinations') {
    return `Pollinations · ${model || 'flux'}`;
  }
  if (status.provider === 'cloudflare') return `Cloudflare Workers AI · ${model || 'flux'}`;
  if (status.provider === 'openai') return `OpenAI · ${model || 'image'}`;
  return null;
}

export function extensionForMime(mimeType = '') {
  const mime = String(mimeType).toLowerCase();
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('png')) return 'png';
  return 'png';
}

export function dataImageBytes(imageUrl) {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,([\s\S]+)$/i.exec(String(imageUrl || ''));
  if (!match) return null;
  const mimeType = match[1].toLowerCase();
  const binary = atob(match[2].replace(/\s/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return { mimeType, bytes };
}

export async function downloadOriginalImage(imageUrl, { mimeType, filename = 'allmodelai-image' } = {}) {
  const decoded = dataImageBytes(imageUrl);
  let blob;
  let extension;
  if (decoded) {
    blob = new Blob([decoded.bytes], { type: decoded.mimeType });
    extension = extensionForMime(decoded.mimeType);
  } else {
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error('Could not download the original image.');
    blob = await response.blob();
    extension = extensionForMime(mimeType || blob.type);
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}.${extension}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
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

export async function requestImageUpscale(imageUrl, signal) {
  return apiFetch('/api/images/upscale', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageUrl }),
    signal,
  });
}
