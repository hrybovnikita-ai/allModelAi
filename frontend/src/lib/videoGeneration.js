import { apiFetch } from './api';
import { resolveApiUrl } from './httpJson.js';

export const VIDEO_UNAVAILABLE_MESSAGE =
  'Video generation is temporarily unavailable. Please try again in a moment.';

export const VIDEO_NOT_CONFIGURED_MESSAGE =
  'Video generation is not configured on the server. Add MAGIC_HOUR_API_KEY or GEMINI_API_KEY on the backend.';

export const VIDEO_ASPECTS = [
  { id: '16:9', label: 'Landscape (16:9)' },
  { id: '9:16', label: 'Portrait (9:16)' },
  { id: '1:1', label: 'Square (1:1)' },
];

export const VIDEO_RESOLUTIONS = [
  { id: '480p', label: '480p (lower cost)' },
  { id: '720p', label: '720p' },
  { id: '1080p', label: '1080p (slower)' },
];

export const VIDEO_DURATIONS = [
  { id: 4, label: '4 seconds' },
  { id: 5, label: '5 seconds' },
  { id: 8, label: '8 seconds' },
];

const ACTIVE_JOB_STATUSES = new Set(['preparing', 'queued', 'generating']);

export function userFacingVideoError(responseOk, data = {}) {
  if (responseOk && data.jobId && ACTIVE_JOB_STATUSES.has(data.status)) return null;
  if (responseOk && data.success !== false && (data.videoUrl || data.status === 'completed')) return null;
  if (data.code === 'MAGIC_HOUR_NOT_CONFIGURED' || data.code === 'GEMINI_NOT_CONFIGURED' || data.code === 'VIDEO_NOT_CONFIGURED') {
    return data.message || VIDEO_NOT_CONFIGURED_MESSAGE;
  }
  if (data.code === 'MAGIC_HOUR_INSUFFICIENT_CREDITS') {
    return data.message || 'Magic Hour API credits are insufficient. Add credits in the Magic Hour Developer Hub.';
  }
  if (data.code === 'MAGIC_HOUR_RATE_LIMIT' || data.code === 'GEMINI_RATE_LIMIT' || data.code === 'VIDEO_JOB_LIMIT') {
    return data.message || 'Video generation rate limit reached. Please try again later.';
  }
  if (data.code === 'MAGIC_HOUR_UNAUTHORIZED') {
    return data.message || 'Magic Hour rejected the API key. Regenerate it in the Developer Hub and update MAGIC_HOUR_API_KEY on the backend.';
  }
  if (data.code === 'VIDEO_NOT_ALLOWED') {
    return data.message || 'AI video generation requires an active subscription or Developer access.';
  }
  if (data.code === 'MAGIC_HOUR_INVALID_REQUEST') {
    return data.message || 'Those video settings are not supported for the selected model. Try another duration or resolution.';
  }
  if (data.code === 'MAGIC_HOUR_SUBSCRIPTION_REQUIRED' || data.code === 'MAGIC_HOUR_PLAN_UPGRADE') {
    return data.message || 'Your Magic Hour API plan does not support this video request.';
  }
  if (responseOk === false && data.message === 'Route not found') {
    return 'Video API route was not found. Start or restart the AllModelAI backend on port 5050 (npm run dev in backend).';
  }
  if (data.code === 'VIDEO_GENERATION_UNAVAILABLE' || data.code === 'GEMINI_VIDEO_FAILED' || data.code === 'MAGIC_HOUR_UNAVAILABLE') {
    return VIDEO_UNAVAILABLE_MESSAGE;
  }
  const raw = String(data.message || '').trim();
  return raw || VIDEO_UNAVAILABLE_MESSAGE;
}

const VIDEO_GENERATE_PATHS = ['/api/video/generate', '/api/videos'];

export async function fetchVideoGenerationStatus({ probeAuth = true } = {}) {
  const query = probeAuth ? '?probeAuth=1' : '';
  const response = await apiFetch(`/api/videos/status${query}`);
  if (!response.ok) {
    const data = await response.clone().json().catch(() => ({}));
    return {
      configured: false,
      activeProvider: null,
      providers: {},
      statusError: response.status === 401 ? 'auth' : response.status === 404 ? 'route_missing' : 'request_failed',
      message: data?.message || null,
    };
  }
  return response.json();
}

async function postVideoGenerate(body, signal) {
  let lastResponse = null;
  for (const path of VIDEO_GENERATE_PATHS) {
    const response = await apiFetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
    lastResponse = response;
    if (response.status !== 404) return response;
  }
  return lastResponse;
}

export function buildVideoRequestBody({
  prompt,
  aspectRatio = '16:9',
  resolution = '720p',
  durationSeconds = 5,
  negativePrompt = '',
  imageUrl = '',
  wait = false,
  provider = '',
}) {
  const body = {
    prompt: String(prompt || '').trim(),
    aspectRatio,
    resolution,
    durationSeconds,
    wait,
  };
  if (negativePrompt) body.negativePrompt = String(negativePrompt).trim();
  if (imageUrl) body.imageUrl = imageUrl;
  if (provider) body.provider = provider;
  return body;
}

export function resolveVideoPlaybackUrl(videoUrl) {
  if (!videoUrl) return '';
  if (videoUrl.startsWith('data:') || videoUrl.startsWith('http://') || videoUrl.startsWith('https://')) {
    return videoUrl;
  }
  return resolveApiUrl(videoUrl);
}

export function formatVideoJobStatus(status) {
  if (status === 'queued') return 'Queued';
  if (status === 'preparing') return 'Preparing';
  if (status === 'generating') return 'Processing';
  if (status === 'completed') return 'Completed';
  if (status === 'failed') return 'Failed';
  return 'Working…';
}

export async function requestVideoGeneration(body, signal) {
  const response = await postVideoGenerate(body, signal);
  const data = await response.clone().json().catch(() => ({}));
  if (response.status === 404) {
    throw Object.assign(
      new Error('Video API route was not found. Restart the backend (port 5050) and ensure Vite proxy targets it.'),
      { code: 'VIDEO_ROUTE_MISSING', status: 404 },
    );
  }
  const userError = userFacingVideoError(response.ok, data);
  if (userError) {
    const error = new Error(userError);
    error.code = data.code;
    error.response = response;
    throw error;
  }
  return { response, data };
}

export async function pollVideoJob(jobId, { signal, onUpdate } = {}) {
  let delay = 4000;
  while (true) {
    const response = await apiFetch(`/api/video/jobs/${encodeURIComponent(jobId)}`, { signal });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = userFacingVideoError(false, data);
      throw new Error(message || 'Could not check video job status.');
    }
    onUpdate?.(data);
    if (data.status === 'completed' && data.videoUrl) return data;
    if (data.status === 'failed') {
      throw new Error(data.errorMessage || 'Video generation failed.');
    }
    await new Promise((resolve) => setTimeout(resolve, delay));
    delay = Math.min(Math.round(delay * 1.2), 15000);
  }
}

export async function downloadVideo(videoUrl, filename = 'allmodelai-video') {
  const needsAuth = String(videoUrl).startsWith('/api/');
  const response = needsAuth
    ? await apiFetch(videoUrl)
    : await fetch(videoUrl);
  if (!response.ok) throw new Error('Could not download the video.');
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
