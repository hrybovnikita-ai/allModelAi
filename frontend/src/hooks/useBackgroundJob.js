import { useCallback, useEffect, useRef, useState } from 'react';
import {
  cancelBackgroundJob,
  cancelImageJob,
  fetchBackgroundJob,
  fetchImageJob,
  forgetActiveJob,
  isJobActive,
  rememberActiveJob,
  streamJobEvents,
} from '../lib/backgroundJobs';

export function useBackgroundJob(jobId, { kind = 'background', autoRemember = true } = {}) {
  const [job, setJob] = useState(null);
  const [error, setError] = useState('');
  const [streaming, setStreaming] = useState(false);
  const stopRef = useRef(null);

  const refresh = useCallback(async () => {
    if (!jobId) return null;
    const row = kind === 'image'
      ? await fetchImageJob(jobId)
      : await fetchBackgroundJob(jobId);
    setJob(row);
    return row;
  }, [jobId, kind]);

  useEffect(() => {
    if (!jobId) {
      setJob(null);
      return undefined;
    }

    let cancelled = false;
    setError('');

    (async () => {
      try {
        const row = kind === 'image'
          ? await fetchImageJob(jobId)
          : await fetchBackgroundJob(jobId);
        if (!cancelled) setJob(row);
      } catch (e) {
        if (!cancelled) setError(e.message || 'Failed to load job');
      }
    })();

    if (autoRemember) rememberActiveJob(jobId, kind);

    stopRef.current?.();
    setStreaming(true);
    stopRef.current = streamJobEvents(jobId, {
      kind,
      onUpdate: (payload) => {
        setJob((prev) => ({ ...prev, ...payload }));
      },
      onError: () => {
        setStreaming(false);
      },
      onDone: (payload) => {
        setStreaming(false);
        if (payload && isJobActive(payload.status) === false) {
          forgetActiveJob(jobId);
        }
      },
    });

    return () => {
      cancelled = true;
      stopRef.current?.();
      stopRef.current = null;
    };
  }, [jobId, kind, autoRemember]);

  const cancel = useCallback(async () => {
    if (!jobId) return;
    if (kind === 'image') {
      await cancelImageJob(jobId);
    } else {
      await cancelBackgroundJob(jobId);
    }
    forgetActiveJob(jobId);
  }, [jobId, kind]);

  return {
    job,
    error,
    streaming,
    refresh,
    cancel,
  };
}
