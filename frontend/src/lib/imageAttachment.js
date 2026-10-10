const DEFAULT_MAX_DIMENSION = 2048;
const DEFAULT_JPEG_QUALITY = 0.85;
const TARGET_MAX_BYTES = 4 * 1024 * 1024;

export const SUPPORTED_CHAT_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
];

/**
 * Resize/compress an image file for chat vision requests (keeps PNG when alpha likely needed).
 * @param {File} file
 * @param {{ maxDimension?: number, maxBytes?: number }} [options]
 * @returns {Promise<{ dataUrl: string, name: string, type: string, sizeLabel: string }>}
 */
export async function prepareChatImageAttachment(file, options = {}) {
  const maxDimension = options.maxDimension ?? DEFAULT_MAX_DIMENSION;
  const maxBytes = options.maxBytes ?? TARGET_MAX_BYTES;
  if (!file?.type?.startsWith('image/')) {
    throw new Error('Please select a valid image file (PNG, JPEG, WebP, or GIF).');
  }
  if (!SUPPORTED_CHAT_IMAGE_TYPES.includes(file.type) && !/\.(png|jpe?g|webp|gif)$/i.test(file.name || '')) {
    throw new Error('Unsupported image format. Use PNG, JPEG, WebP, or GIF.');
  }
  if (file.size > 25 * 1024 * 1024) {
    throw new Error('Image file is too large (max 25 MB before compression).');
  }

  const dataUrl = await readFileAsDataUrl(file);
  const compressed = await compressDataUrl(dataUrl, file.type, maxDimension, maxBytes);
  const bytes = estimateDataUrlBytes(compressed.dataUrl);
  return {
    dataUrl: compressed.dataUrl,
    name: file.name || 'screenshot.png',
    type: compressed.mimeType,
    sizeLabel: `${Math.max(1, Math.round(bytes / 1024))} KB`,
  };
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read the selected image file.'));
    reader.readAsDataURL(file);
  });
}

function estimateDataUrlBytes(dataUrl) {
  const base64 = String(dataUrl).split(',')[1] || '';
  return Math.floor((base64.length * 3) / 4);
}

async function compressDataUrl(dataUrl, originalType, maxDimension, maxBytes) {
  if (typeof document === 'undefined') {
    return { dataUrl, mimeType: originalType || 'image/png' };
  }
  const img = await loadImage(dataUrl);
  const scale = Math.min(1, maxDimension / Math.max(img.width, img.height, 1));
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { dataUrl, mimeType: originalType || 'image/png' };
  ctx.drawImage(img, 0, 0, width, height);

  const preferPng = originalType === 'image/png' || originalType === 'image/gif';
  let quality = DEFAULT_JPEG_QUALITY;
  let mimeType = preferPng ? 'image/png' : 'image/jpeg';
  let out = canvas.toDataURL(mimeType, quality);
  while (!preferPng && estimateDataUrlBytes(out) > maxBytes && quality > 0.45) {
    quality -= 0.08;
    out = canvas.toDataURL('image/jpeg', quality);
    mimeType = 'image/jpeg';
  }
  if (estimateDataUrlBytes(out) > maxBytes && preferPng) {
    out = canvas.toDataURL('image/jpeg', quality);
    mimeType = 'image/jpeg';
  }
  return { dataUrl: out, mimeType };
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not decode the image.'));
    img.src = src;
  });
}

/**
 * Map backend / network chat errors to user-safe vision messages.
 * @param {Error & { code?: string, status?: number }} error
 * @param {{ hadImage?: boolean }} [context]
 */
export function formatChatVisionError(error, context = {}) {
  const code = error?.code;
  const status = error?.status;
  const serverMessage = error?.message && error.message !== 'Failed to fetch' ? error.message : '';
  if (code === 'VISION_NOT_CONFIGURED') {
    return 'Image analysis is not configured on the server yet. Ask the administrator to add Gemini or OpenAI API keys.';
  }
  if (code === 'VISION_UNSUPPORTED_MODEL') {
    return serverMessage || 'This model cannot analyze images. Switch to Smart Router, Gemini, or GPT.';
  }
  if (code === 'VISION_INVALID_IMAGE' || code === 'VISION_UNSUPPORTED_FORMAT') {
    return serverMessage || 'Invalid or unsupported image. Use PNG, JPEG, or WebP.';
  }
  if (code === 'VISION_IMAGE_TOO_LARGE') {
    return serverMessage || 'Image is too large. Try a smaller screenshot.';
  }
  if (code === 'AI_BILLING') {
    return 'The vision provider has insufficient credits or quota. Try again later or switch models.';
  }
  if (code === 'VISION_UPSTREAM' || code === 'VISION_PROVIDER_ERROR') {
    return error.message || 'The vision model could not analyze this image. Retry or use Smart Router.';
  }
  if (code === 'AI_UPSTREAM' && context.hadImage) {
    return error.message || 'Image analysis failed at the AI provider. Retry in a moment.';
  }
  if (status === 413) {
    return 'The image upload is too large for the server. Try a smaller screenshot.';
  }
  if (status === 504) {
    return 'Vision analysis timed out. Try a smaller image or retry.';
  }
  if (error?.message === 'Failed to fetch') {
    return 'Could not connect to the server. Check your connection and try again.';
  }
  return error?.message || 'Could not connect to the AI server. Please try again.';
}
