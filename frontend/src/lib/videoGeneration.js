import { apiFetch } from './api';

export const VIDEO_UNAVAILABLE_MESSAGE =
  'Video generation is temporarily unavailable. Please try again in a moment.';

export const VIDEO_NOT_CONFIGURED_MESSAGE =
  'Video generation is not configured on the server. Add GEMINI_API_KEY on Render.';

export const VIDEO_ASPECTS = [
  { id: '16:9', label: 'Landscape (16:9)' },
  { id: '9:16', label: 'Portrait (9:16)' },
];

export const VIDEO_RESOLUTIONS = [
  { id: '720p', label: '720p' },
  { id: '1080p', label: '1080p (slower)' },
];

export function userFacingVideoError(responseOk, data = {}) {
  if (responseOk && data.success !== false && data.videoUrl) return null;
  if (data.code === 'GEMINI_NOT_CONFIGURED') {
    const missing = data.missingEnvVars;
    if (Array.isArray(missing) && missing.length) {
      return `${VIDEO_NOT_CONFIGURED_MESSAGE} Required: ${missing.join(', ')}.`;
    }
    return data.message || VIDEO_NOT_CONFIGURED_MESSAGE;
  }
  if (data.code === 'VIDEO_GENERATION_UNAVAILABLE' || data.code === 'GEMINI_VIDEO_FAILED') {
    return VIDEO_UNAVAILABLE_MESSAGE;
  }
  const raw = String(data.message || '').trim();
  return raw || VIDEO_UNAVAILABLE_MESSAGE;
}

export async function fetchVideoGenerationStatus() {
  const response = await apiFetch('/api/videos/status');
  if (!response.ok) {
    return { configured: false, provider: 'google-veo', model: null };
  }
  return response.json();
}

export function buildVideoRequestBody({
  prompt,
  aspectRatio = '16:9',
  resolution = '720p',
  negativePrompt = '',
  imageUrl = '',
}) {
  const body = {
    prompt: String(prompt || '').trim(),
    aspectRatio,
    resolution,
  };
  if (negativePrompt) body.negativePrompt = String(negativePrompt).trim();
  if (imageUrl) body.imageUrl = imageUrl;
  return body;
}

export async function requestVideoGeneration(body, signal) {
  const response = await apiFetch('/api/videos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  const data = await response.clone().json().catch(() => ({}));
  const userError = userFacingVideoError(response.ok, data);
  if (userError) {
    const error = new Error(userError);
    error.code = data.code;
    error.response = response;
    throw error;
  }
  return response;
}

export async function downloadVideo(videoUrl, filename = 'allmodelai-video') {
  if (String(videoUrl).startsWith('data:')) {
    const match = /^data:(video\/[a-z0-9.+-]+);base64,([\s\S]+)$/i.exec(videoUrl);
    if (!match) throw new Error('Invalid video data.');
    const mimeType = match[1].toLowerCase();
    const binary = atob(match[2].replace(/\s/g, ''));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: mimeType });
    const ext = mimeType.includes('webm') ? 'webm' : 'mp4';
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}.${ext}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    return;
  }
  const response = await fetch(videoUrl);
  if (!response.ok) throw new Error('Could not download the video.');
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}.mp4`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
