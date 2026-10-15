/**
 * Conversation ownership helpers for chat streaming / history races.
 * Keep response text in the open thread; never rely on toast-only delivery.
 */

export function sameConversationId(left, right) {
  if (left == null || right == null) return left == null && right == null;
  return String(left) === String(right);
}

/**
 * Whether streamed/final assistant updates should apply to the currently open chat.
 *
 * @param {object} args
 * @param {string|null|undefined} args.activeId - conversation currently open in the UI
 * @param {string|null|undefined} args.requestId - conversation this request is writing to
 * @param {string|null|undefined} args.startedId - conversation open when send began
 * @param {string|null|undefined} [args.assistantMessageId] - placeholder id still in local messages
 * @param {Array} [args.messages] - current local messages (optional, strengthens ownership)
 */
export function responseBelongsToOpenChat({
  activeId,
  requestId,
  startedId,
  assistantMessageId,
  messages,
} = {}) {
  const request = requestId ?? startedId ?? null;
  const active = activeId ?? null;

  if (assistantMessageId && Array.isArray(messages)) {
    const stillHasPlaceholder = messages.some(
      (message) => message?.role === 'assistant' && String(message.id || '') === String(assistantMessageId),
    );
    if (stillHasPlaceholder) {
      // Placeholder is still on screen — always apply, even during null→id attachment.
      if (active == null && (startedId == null || sameConversationId(active, startedId))) return true;
      if (request == null || sameConversationId(active, request)) return true;
      // User switched to another conversation while the placeholder was left behind — do not apply.
      if (!sameConversationId(active, request) && !sameConversationId(active, startedId)) return false;
      return true;
    }
  }

  // Explicit switch away from the conversation this request belongs to.
  if (request != null && active != null && !sameConversationId(active, request)) return false;

  // User opened a brand-new empty chat after starting this request on an existing thread.
  if (startedId != null && active == null) return false;

  // New chat: request created an id but React state has not attached it yet.
  if (startedId == null && active == null) return true;

  // New chat: UI attached the request conversation, or still null while request id exists.
  if (startedId == null && request != null) {
    return active == null || sameConversationId(active, request);
  }

  return sameConversationId(active, request);
}

/**
 * Patch an assistant message by stable id first, then by index fallback.
 * Avoids silent no-ops when history refresh reshuffles the array mid-stream.
 */
export function patchAssistantMessage(messages, { id, index } = {}, patch = {}) {
  const list = Array.isArray(messages) ? messages : [];
  if (!list.length) return list;

  const cleanPatch = Object.fromEntries(
    Object.entries(patch || {}).filter(([, value]) => value !== undefined),
  );
  if (!Object.keys(cleanPatch).length) return list;

  if (id != null && id !== '') {
    const idKey = String(id);
    let found = false;
    const byId = list.map((message) => {
      if (message?.role === 'assistant' && String(message.id || '') === idKey) {
        found = true;
        return { ...message, ...cleanPatch };
      }
      return message;
    });
    if (found) return byId;
  }

  if (Number.isInteger(index) && index >= 0 && index < list.length) {
    return list.map((message, messageIndex) => (
      messageIndex === index ? { ...message, ...cleanPatch } : message
    ));
  }

  return list;
}

/**
 * Background "Model replied" banners are only for answers that finished after
 * the user left that conversation. Successful in-view replies never use a toast.
 */
export function shouldShowBackgroundReplyNotice({
  belongsToOpenChat,
  hasAssistantText = false,
} = {}) {
  if (!hasAssistantText) return false;
  return !belongsToOpenChat;
}

/**
 * Avoid clobbering an in-flight assistant placeholder with stale history.
 */
export function shouldReplaceMessagesFromHistory({
  isSending = false,
  activeId = null,
  historyConversationId = null,
  localMessages = [],
  historyMessages = [],
} = {}) {
  if (!sameConversationId(activeId, historyConversationId)) return false;
  if (!Array.isArray(historyMessages) || !historyMessages.length) return false;

  if (isSending) {
    const localAssistant = [...localMessages].reverse().find((message) => message?.role === 'assistant');
    const historyAssistant = [...historyMessages].reverse().find((message) => message?.role === 'assistant');
    const localText = String(localAssistant?.text || localAssistant?.content || '').trim();
    const historyText = String(historyAssistant?.text || historyAssistant?.content || '').trim();
    // Keep the richer in-flight local transcript while the request is open.
    if (localText && localText.length >= historyText.length) return false;
  }

  return true;
}

/**
 * Extract assistant text from heterogeneous provider / SSE payloads.
 */
export function extractAssistantText(payload) {
  if (payload == null) return '';
  if (typeof payload === 'string') return payload;
  if (typeof payload !== 'object') return '';

  const candidates = [
    payload.text,
    payload.message,
    payload.content,
    payload.output_text,
    payload.delta,
    payload.choices?.[0]?.delta?.content,
    payload.choices?.[0]?.message?.content,
    payload.result?.response,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate) return candidate;
    if (Array.isArray(candidate)) {
      const joined = candidate
        .map((part) => (typeof part === 'string' ? part : part?.text || ''))
        .join('');
      if (joined) return joined;
    }
  }
  return '';
}

/**
 * Decide whether history bootstrap may open/replace the visible conversation.
 * After the first bootstrap, an empty "New chat" view must stay empty.
 */
export function shouldBootstrapOpenConversation({
  hasBootstrapped = false,
  activeId = null,
  isSending = false,
  localMessageCount = 0,
  requestedId = null,
  historyFirstId = null,
} = {}) {
  if (isSending) return false;
  if (requestedId) return true;
  if (localMessageCount > 0 && activeId == null) return false;
  if (activeId != null) return false;
  if (hasBootstrapped) return false;
  return Boolean(historyFirstId);
}
