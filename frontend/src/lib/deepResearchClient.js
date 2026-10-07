/** Client helpers for Deep Research clarify + SSE parsing. */

export const DEEP_RESEARCH_PROGRESS_STEPS = [
  { id: 'understanding', label: 'Understanding your question' },
  { id: 'planning', label: 'Research plan created' },
  { id: 'searching', label: 'Searching the web' },
  { id: 'reading', label: 'Reading sources' },
  { id: 'analyzing', label: 'Analyzing information' },
  { id: 'cross_check', label: 'Verifying claims' },
  { id: 'writing', label: 'Writing report' },
];

export function stepIndexForStage(stage) {
  const order = DEEP_RESEARCH_PROGRESS_STEPS.map((s) => s.id);
  const idx = order.indexOf(stage);
  return idx >= 0 ? idx : 0;
}

export async function fetchResearchClarification(apiFetch, { query, skipClarification = false }) {
  const response = await apiFetch('/api/research/clarify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, skipClarification }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || 'Could not start Deep Research.');
  }
  return response.json();
}

export function applyDeepResearchSseEvent(message, event) {
  const next = { ...message };

  if (event.researchTopic) {
    next.deepResearchTopic = event.researchTopic;
  }

  if (event.researchEvent) {
    next.lastResearchEvent = event.researchEvent;
  }

  if (event.researchMeta) {
    next.researchMeta = event.researchMeta;
  }

  if (event.deepResearchStage || event.webSearchStatus) {
    const status = event.deepResearchStage || event.webSearchStatus;
    next.webSearchStatus = status;
    next.deepResearchLabel = event.deepResearchLabel || next.deepResearchLabel;
    next.deepResearchProgress = {
      ...(next.deepResearchProgress || {}),
      activeStage: status,
      sourceCount: event.sourceCount ?? event.count ?? next.deepResearchProgress?.sourceCount,
      queryCount: event.queryCount ?? next.deepResearchProgress?.queryCount,
    };
  }

  if (event.acceptedCount != null) {
    next.deepResearchProgress = {
      ...(next.deepResearchProgress || {}),
      acceptedCount: event.acceptedCount,
    };
  }

  if (event.sourceCount != null || event.count != null) {
    const count = event.sourceCount ?? event.count;
    next.webSearchCount = count;
    next.deepResearchProgress = {
      ...(next.deepResearchProgress || {}),
      sourceCount: count,
      rawSourceCount: count,
    };
  }

  if (Array.isArray(event.webSources)) {
    next.webSources = event.webSources;
    next.deepResearchProgress = {
      ...(next.deepResearchProgress || {}),
      sourceCount: event.webSources.length,
    };
  }

  if (Array.isArray(event.knowledgeSources)) {
    next.knowledgeSources = event.knowledgeSources;
  }

  if (event.text) {
    next.text = (next.text || '') + event.text;
  }

  if (event.webSearchComplete === true) {
    next.webSearchComplete = true;
    next.webSearching = false;
    next.deepResearchClarification = null;
  }

  if (event.researchFailure?.message) {
    next.deepResearchError = event.researchFailure.message;
    next.webSearching = false;
    next.researchFailure = event.researchFailure;
  } else if (event.researchEvent === 'research.failed' && event.message) {
    next.deepResearchError = event.message;
    next.webSearching = false;
    next.researchFailure = { code: event.failureCode || 'research_failed', message: event.message };
  } else if (event.code === 'search_not_configured' && event.message) {
    next.deepResearchError = event.message;
    next.webSearching = false;
  }

  return next;
}

export async function consumeDeepResearchStream(researchResponse, { onEvent, signal } = {}) {
  await checkStreamResponse(researchResponse);
  const reader = researchResponse.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let assistantText = '';
  let webSources = [];
  let webSearchComplete = false;
  let researchMeta = null;

  while (true) {
    if (signal?.aborted) break;
    const { done, value } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const events = buffer.replaceAll('\r\n', '\n').split('\n\n');
    buffer = events.pop() || '';

    for (const eventData of events) {
      const dataLine = eventData.split('\n').find((line) => line.startsWith('data: '));
      if (!dataLine || dataLine.slice(6) === '[DONE]') continue;
      const event = JSON.parse(dataLine.slice(6));
      if (event.researchEvent === 'research.failed' || event.researchFailure) {
        onEvent?.(event);
        continue;
      }
      if (event.error && !event.researchEvent) throw new Error(event.message || event.error);
      if (event.code && event.message && !event.text && event.code !== 'no_sources') throw new Error(event.message);
      onEvent?.(event);
      if (event.text) assistantText += event.text;
      if (Array.isArray(event.webSources)) webSources = event.webSources;
      if (event.webSearchComplete === true) webSearchComplete = true;
      if (event.researchMeta) researchMeta = event.researchMeta;
    }
    if (done) break;
  }

  return { assistantText, webSources, webSearchComplete, researchMeta };
}

async function checkStreamResponse(researchResponse) {
  if (researchResponse.headers.get('content-type')?.includes('application/json')) {
    const errorData = await researchResponse.json().catch(() => ({}));
    throw new Error(errorData.message || 'Could not run Deep Research.');
  }
}
