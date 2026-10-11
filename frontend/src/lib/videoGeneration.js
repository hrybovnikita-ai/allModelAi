import { apiFetch } from './api';
import { resolveApiUrl } from './httpJson.js';
import { classifyNetworkError } from './networkErrors.js';

export {
  VIDEO_ASPECTS,
  VIDEO_RESOLUTIONS,
  VIDEO_DURATIONS,
  LTX_VIDEO_DURATION_IDS,
  VIDEO_DEFAULTS,
  buildVideoRequestBody,
  clampVideoSettings,
  durationOptionsForModel,
  durationOptionsFromIds,
  resolutionOptionsForModel,
  resolveVideoUiOptions,
} from './videoGenerationOptions.js';

const PENDING_VIDEO_JOB_STORAGE_KEY = 'allmodelai_pending_video_job_id';

export const VIDEO_UNAVAILABLE_MESSAGE =
  'Video generation is temporarily unavailable. Please try again in a moment.';

export const VIDEO_NOT_CONFIGURED_MESSAGE =
  'Video generation is not configured on the server. Add MAGIC_HOUR_API_KEY or GEMINI_API_KEY on the backend.';

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
  if (data.code === 'VIDEO_IMAGE_BLOB_UNSUPPORTED' || data.code === 'VIDEO_IMAGE_INVALID') {
    return data.message || 'Choose a reference image file or use the last generated image from chat.';
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
  if (data.code === 'VIDEO_NETWORK_ERROR') {
    return data.message || 'Network error while starting video generation. Your job may still be processing—check active jobs or refresh.';
  }
  const raw = String(data.message || '').trim();
  return raw || VIDEO_UNAVAILABLE_MESSAGE;
}

const VIDEO_GENERATE_PATHS = ['/api/video/generate', '/api/videos'];

export async function fetchActiveVideoJobs() {
  const response = await apiFetch('/api/video/jobs');
  if (!response.ok) return [];
  const data = await response.json().catch(() => ({}));
  return Array.isArray(data.jobs) ? data.jobs : [];
}

export function rememberPendingVideoJobId(jobId) {
  if (!jobId || typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(PENDING_VIDEO_JOB_STORAGE_KEY, String(jobId));
  } catch {
    /* ignore */
  }
}

export function readPendingVideoJobId() {
  if (typeof sessionStorage === 'undefined') return '';
  try {
    return sessionStorage.getItem(PENDING_VIDEO_JOB_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export function clearPendingVideoJobId() {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(PENDING_VIDEO_JOB_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function videoNetworkErrorMessage(error) {
  const classified = classifyNetworkError(error, { phase: 'video' });
  if (classified.code === 'BACKEND_UNREACHABLE') {
    return 'Connection to the video server was lost (ERR_CONNECTION_RESET). The backend may have restarted—use “Resume video job” if one exists, or run `npm run dev:stable` to avoid watch restarts during generation.';
  }
  return classified.message;
}

export function magicHourProviderReady(status) {
  const mh = status?.providers?.magichour;
  if (!mh?.apiKeyPresent && !mh?.configured) return false;
  if (mh?.ready === true || mh?.authProbe?.ok === true) return true;
  if (mh?.authProbe?.ok === false && mh?.authProbe?.keyConfigured) return false;
  return Boolean(mh?.configured);
}

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
  let response;
  try {
    response = await postVideoGenerate(body, signal);
  } catch (error) {
    const message = videoNetworkErrorMessage(error);
    throw Object.assign(new Error(message), {
      code: 'VIDEO_NETWORK_ERROR',
      cause: error,
    });
  }
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
    if (data.status === 'completed' && data.videoUrl) {
      clearPendingVideoJobId();
      return data;
    }
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
