import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '../../lib/api.js';
import {
  buildSuggestionsContextKey,
  parseSuggestionsContextKey,
} from './chatContextSuggestionsHelpers.js';

/**
 * Debounced follow-up suggestions below the composer (not welcome cards).
 */
export function useChatContextSuggestions({
  prompt,
  messages,
  activeConversationId,
  selectedSkill,
  isSending,
  isGuest,
}) {
  const [contextSuggestions, setContextSuggestions] = useState([]);
  const abortRef = useRef(null);
  const lastFetchedKeyRef = useRef('');
  const inflightRef = useRef(false);
  const contextKeyRef = useRef('');
  const isSendingRef = useRef(isSending);
  const isGuestRef = useRef(isGuest);

  isSendingRef.current = isSending;
  isGuestRef.current = isGuest;

  const suggestionsContextKey = useMemo(
    () => buildSuggestionsContextKey({ prompt, messages, activeConversationId, selectedSkill }),
    [activeConversationId, messages, prompt, selectedSkill],
  );

  contextKeyRef.current = suggestionsContextKey;

  const loadContextSuggestions = useCallback(async (contextKey) => {
    const key = String(contextKey || '').trim();
    const lastMessage = parseSuggestionsContextKey(key);
    if (!key || lastMessage.length < 12 || isGuestRef.current || isSendingRef.current) {
      if (!key) setContextSuggestions([]);
      return;
    }
    if (key === lastFetchedKeyRef.current || inflightRef.current) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    inflightRef.current = true;

    try {
      const response = await apiFetch('/api/chat/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lastMessage }),
        signal: controller.signal,
      });
      if (controller.signal.aborted || key !== contextKeyRef.current) return;
      if (!response.ok) return;
      const data = await response.json();
      lastFetchedKeyRef.current = key;
      setContextSuggestions(Array.isArray(data.suggestions) ? data.suggestions.slice(0, 3) : []);
    } catch (error) {
      if (error?.name === 'AbortError') return;
      if (key === contextKeyRef.current) setContextSuggestions([]);
    } finally {
      inflightRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!suggestionsContextKey) {
      abortRef.current?.abort();
      lastFetchedKeyRef.current = '';
      setContextSuggestions([]);
      return undefined;
    }
    if (isSending || isGuest) return undefined;

    const handler = setTimeout(() => {
      loadContextSuggestions(suggestionsContextKey).catch(() => {});
    }, 500);

    return () => clearTimeout(handler);
  }, [suggestionsContextKey, isSending, isGuest, loadContextSuggestions]);

  useEffect(() => () => abortRef.current?.abort(), []);

  return contextSuggestions;
}
