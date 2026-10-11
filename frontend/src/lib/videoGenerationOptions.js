export const VIDEO_ASPECTS = [
  { id: '16:9', label: 'Landscape (16:9)' },
  { id: '9:16', label: 'Portrait (9:16)' },
  { id: '1:1', label: 'Square (1:1)' },
];

export const VIDEO_RESOLUTIONS = [
  { id: '480p', label: '480p' },
  { id: '720p', label: '720p' },
  { id: '1080p', label: '1080p (slower)' },
];

/** Default LTX-2.5 duration choices (aligned with backend magicHourCapabilities). */
export const LTX_VIDEO_DURATION_IDS = [3, 4, 5, 6, 8, 10, 15, 20, 30];

export const VIDEO_DURATIONS = LTX_VIDEO_DURATION_IDS.map((id) => ({
  id,
  label: `${id} second${id === 1 ? '' : 's'}`,
}));

export const VIDEO_DEFAULTS = {
  aspectRatio: '16:9',
  resolution: '480p',
  durationSeconds: 3,
};

export function durationOptionsFromIds(ids) {
  return (Array.isArray(ids) ? ids : []).map((id) => ({
    id: Number(id),
    label: `${id} second${id === 1 ? '' : 's'}`,
  }));
}

export function resolutionOptionsForModel(modelSpec) {
  const allowed = modelSpec?.resolutions;
  if (!Array.isArray(allowed) || !allowed.length) return VIDEO_RESOLUTIONS;
  return VIDEO_RESOLUTIONS.filter((item) => allowed.includes(item.id));
}

export function durationOptionsForModel(modelSpec) {
  const ids = modelSpec?.durationSecondsOptions;
  if (Array.isArray(ids) && ids.length) return durationOptionsFromIds(ids);
  return VIDEO_DURATIONS;
}

export function resolveVideoUiOptions(providerStatus) {
  const mh = providerStatus?.providers?.magichour;
  const modelId = mh?.model || 'ltx-2.5';
  const modelSpec = Array.isArray(mh?.models)
    ? mh.models.find((item) => item.id === modelId) || mh.models[0]
    : null;
  return {
    modelId,
    modelSpec,
    resolutions: resolutionOptionsForModel(modelSpec),
    durations: durationOptionsForModel(modelSpec),
    defaults: {
      aspectRatio: '16:9',
      resolution: modelSpec?.defaultResolution || VIDEO_DEFAULTS.resolution,
      durationSeconds: modelSpec?.defaultDurationSeconds ?? VIDEO_DEFAULTS.durationSeconds,
    },
  };
}

export function clampVideoSettings(settings, uiOptions) {
  const resolutions = uiOptions?.resolutions || VIDEO_RESOLUTIONS;
  const durations = uiOptions?.durations || VIDEO_DURATIONS;
  const durationIds = durations.map((item) => item.id);
  const resolution = resolutions.some((item) => item.id === settings.resolution)
    ? settings.resolution
    : (uiOptions?.defaults?.resolution || VIDEO_DEFAULTS.resolution);
  const durationSeconds = durationIds.includes(settings.durationSeconds)
    ? settings.durationSeconds
    : (uiOptions?.defaults?.durationSeconds ?? VIDEO_DEFAULTS.durationSeconds);
  return { ...settings, resolution, durationSeconds };
}

export function buildVideoRequestBody({
  prompt,
  aspectRatio = VIDEO_DEFAULTS.aspectRatio,
  resolution = VIDEO_DEFAULTS.resolution,
  durationSeconds = VIDEO_DEFAULTS.durationSeconds,
  negativePrompt = '',
  imageUrl = '',
  wait = false,
  provider = '',
  conversationId = '',
  messageId = '',
}) {
  const body = {
    prompt: String(prompt || '').trim(),
    aspectRatio,
    resolution,
    durationSeconds: Number(durationSeconds),
    wait,
  };
  if (negativePrompt) body.negativePrompt = String(negativePrompt).trim();
  if (imageUrl) body.imageUrl = imageUrl;
  if (provider) body.provider = provider;
  if (conversationId) body.conversationId = String(conversationId);
  if (messageId) body.messageId = String(messageId);
  return body;
}
