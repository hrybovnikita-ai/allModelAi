export const VIDEO_ATTACHMENT_VERSION = 1;

export function buildVideoAttachmentFromPayload(payload, { conversationId = '', messageId = '' } = {}) {
  if (!payload?.jobId) return null;
  return {
    version: VIDEO_ATTACHMENT_VERSION,
    id: `vatt-${payload.jobId}`,
    videoJobId: payload.jobId,
    conversationId: conversationId || null,
    messageId: messageId || null,
    provider: payload.provider || null,
    model: payload.model || null,
    durationSeconds: payload.durationSeconds ?? null,
    resolution: payload.resolution || null,
    aspectRatio: payload.aspectRatio || null,
    status: payload.status || 'completed',
    playbackUrl: payload.videoUrl || null,
    mimeType: payload.mimeType || 'video/mp4',
    createdAt: payload.createdAt || new Date().toISOString(),
  };
}

export function normalizeVideoMessage(message) {
  if (!message || typeof message !== 'object') return message;
  const aiSticker = message.aiSticker?.emoji
    ? {
      id: message.aiSticker.id,
      emoji: message.aiSticker.emoji,
      label: message.aiSticker.label,
      animated: message.aiSticker.animated !== false,
    }
    : undefined;
  const attachment = message.videoAttachment?.version === VIDEO_ATTACHMENT_VERSION
    ? message.videoAttachment
    : null;
  const videoUrl = message.videoUrl
    || attachment?.playbackUrl
    || null;
  const videoJobId = message.videoJobId || attachment?.videoJobId || null;
  if (!videoUrl && !videoJobId && !attachment && !aiSticker) return message;
  return {
    ...message,
    ...(aiSticker ? { aiSticker } : {}),
    videoUrl: videoUrl || message.videoUrl,
    videoJobId,
    videoModel: message.videoModel || attachment?.model,
    videoAspect: message.videoAspect || attachment?.aspectRatio,
    videoResolution: message.videoResolution || attachment?.resolution,
    videoMimeType: message.videoMimeType || attachment?.mimeType,
    videoJobStatus: message.videoJobStatus || attachment?.status,
    generatingVideo: message.generatingVideo ?? ['preparing', 'queued', 'generating'].includes(attachment?.status),
    videoAttachment: attachment || message.videoAttachment,
  };
}

export function normalizeConversationMessages(messages) {
  return (Array.isArray(messages) ? messages : []).map(normalizeVideoMessage);
}

export function messageHasPlayableVideo(message) {
  const normalized = normalizeVideoMessage(message);
  return Boolean(normalized.videoUrl);
}

export function messageHasVideoReference(message) {
  const normalized = normalizeVideoMessage(message);
  return Boolean(normalized.videoUrl || normalized.videoJobId);
}

export function buildAssistantVideoMessage(finalVideo, { messageId, conversationId } = {}) {
  const attachment = buildVideoAttachmentFromPayload(finalVideo, { messageId, conversationId });
  return normalizeVideoMessage({
    role: 'assistant',
    id: messageId,
    text: 'Done! Here is your video.',
    content: 'Done! Here is your video.',
    videoUrl: finalVideo.videoUrl,
    videoModel: finalVideo.model,
    videoAspect: finalVideo.aspectRatio,
    videoResolution: finalVideo.resolution,
    videoMimeType: finalVideo.mimeType,
    videoJobId: finalVideo.jobId,
    generatingVideo: false,
    videoAttachment: attachment,
  });
}
