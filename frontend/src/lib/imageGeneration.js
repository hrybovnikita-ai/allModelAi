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

export const IMAGE_UNAVAILABLE_MESSAGE =
  'Image generation is temporarily unavailable. Please try again in a moment.';

export const IMAGE_NOT_CONFIGURED_MESSAGE =
  'Image generation is not configured on the server yet. Ask the administrator to add an image API key on Render.';

const PROVIDER_BILLING_LEAK =
  /pollen|pollinations\.ai|insufficient balance|top up at|available balance|credits remaining|platform\.openai\.com/i;

export function formatImageServerError(data = {}, fallback = IMAGE_UNAVAILABLE_MESSAGE) {
  if (data.code === 'IMAGE_NOT_CONFIGURED' || data.code === 'COMFY_CLOUD_NOT_CONFIGURED') {
    const missing = data.missingEnvVars;
    if (Array.isArray(missing) && missing.length) {
      return `${IMAGE_NOT_CONFIGURED_MESSAGE} Required: ${missing.join('; ')}.`;
    }
    if (data.code === 'COMFY_CLOUD_NOT_CONFIGURED') {
      return data.message || 'Comfy Cloud API key is missing on the server (COMFY_CLOUD_API_KEY).';
    }
    return data.message || IMAGE_NOT_CONFIGURED_MESSAGE;
  }
  if (data.code === 'IMAGE_GENERATION_UNAVAILABLE') {
    return data.message && !PROVIDER_BILLING_LEAK.test(data.message) ? data.message : IMAGE_UNAVAILABLE_MESSAGE;
  }
  return null;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const IMAGE_JOB_POLL_INTERVAL_MS = 2000;
export const IMAGE_JOB_MAX_WAIT_MS = 120000;

/** Never surface upstream billing or provider branding in the UI. */
export function userFacingImageGenerationError(responseOk, data = {}) {
  if (responseOk && data.success !== false && data.imageUrl) return null;
  const configured = formatImageServerError(data);
  if (configured) return configured;
  if (data.code === 'IMAGE_GENERATION_UNAVAILABLE') return IMAGE_UNAVAILABLE_MESSAGE;
  const raw = String(data.message || '').trim();
  if (!raw || PROVIDER_BILLING_LEAK.test(raw)) return IMAGE_UNAVAILABLE_MESSAGE;
  return raw;
}

export async function fetchImageGenerationStatus() {
  const response = await apiFetch('/api/images/status');
  if (!response.ok) {
    return {
      configured: false,
      provider: 'none',
      pollinations: false,
      model: null,
      configuration: { ok: false, missingEnvVars: [] },
    };
  }
  return response.json();
}

export function imageProviderLabel(status, quality = 'hd') {
  if (!status?.configured) return null;
  const model = status.qualityModels?.[quality] || status.model;
  if (status.provider === 'comfy-cloud') {
    return `Comfy Cloud · ${model || 'Flux Schnell'}`;
  }
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

async function fetchImageJobStatus(jobId, signal) {
  const paths = [
    `/api/images/jobs/${encodeURIComponent(jobId)}`,
    `/api/images/status/${encodeURIComponent(jobId)}`,
  ];
  let lastResponse;
  let lastData = {};
  for (const path of paths) {
    lastResponse = await apiFetch(path, { signal });
    lastData = await lastResponse.json().catch(() => ({}));
    if (lastResponse.status !== 404) break;
  }
  return { response: lastResponse, data: lastData };
}

async function pollImageGenerationJob(jobId, signal, { onPoll } = {}) {
  const deadline = Date.now() + IMAGE_JOB_MAX_WAIT_MS;
  let polls = 0;
  while (Date.now() < deadline) {
    if (signal?.aborted) {
      const abortError = new Error('Image generation was cancelled.');
      abortError.name = 'AbortError';
      throw abortError;
    }
    const { data } = await fetchImageJobStatus(jobId, signal);
    polls += 1;
    onPoll?.({ polls, status: data.status });
    if (data.status === 'completed' && data.imageUrl) {
      return { ok: true, data };
    }
    if (data.status === 'failed' || (data.success === false && data.status !== 'processing')) {
      const userError = userFacingImageGenerationError(false, data);
      const error = new Error(userError || IMAGE_UNAVAILABLE_MESSAGE);
      error.code = data.code;
      error.retryable = data.retryable !== false;
      throw error;
    }
    await sleep(IMAGE_JOB_POLL_INTERVAL_MS);
  }
  const timeoutError = new Error('Image generation timed out. Try Standard quality or tap Retry.');
  timeoutError.code = 'IMAGE_GENERATION_TIMEOUT';
  timeoutError.retryable = true;
  throw timeoutError;
}

/**
 * Starts image generation (async job by default) and returns parsed success payload.
 */
async function postImageGeneration(body, signal, useAsync) {
  return apiFetch('/api/images', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, async: useAsync }),
    signal,
  });
}

export async function requestImageGeneration(body, signal, options = {}) {
  const useAsync = options.async !== false;
  let response = await postImageGeneration(body, signal, useAsync);
  let data = await response.clone().json().catch(() => ({}));

  if ((response.status === 502 || response.status === 503) && useAsync) {
    await sleep(800);
    response = await postImageGeneration(body, signal, useAsync);
    data = await response.clone().json().catch(() => ({}));
  }

  if (response.status === 202 && data.jobId) {
    const polled = await pollImageGenerationJob(data.jobId, signal, { onPoll: options.onPoll });
    return polled.data;
  }

  const userError = userFacingImageGenerationError(response.ok, data);
  if (userError) {
    const error = new Error(userError);
    error.code = data.code;
    error.response = response;
    error.retryable = data.retryable !== false || response.status >= 500 || response.status === 429;
    throw error;
  }
  if (!data?.imageUrl) {
    const error = new Error(IMAGE_UNAVAILABLE_MESSAGE);
    error.code = 'IMAGE_GENERATION_UNAVAILABLE';
    error.retryable = true;
    throw error;
  }
  return data;
}

export async function requestImageUpscale(imageUrl, signal) {
  return apiFetch('/api/images/upscale', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageUrl }),
    signal,
  });
}
