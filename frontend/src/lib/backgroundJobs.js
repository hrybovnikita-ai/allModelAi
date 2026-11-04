import { resolveApiUrl } from './apiBase';

const ACTIVE_JOBS_KEY = 'allmodelai.activeBackgroundJobs';

export function rememberActiveJob(jobId, kind = 'background') {
  if (!jobId) return;
  try {
    const raw = sessionStorage.getItem(ACTIVE_JOBS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    const entry = { id: jobId, kind, ts: Date.now() };
    const next = [entry, ...list.filter((row) => row.id !== jobId)].slice(0, 20);
    sessionStorage.setItem(ACTIVE_JOBS_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function listRememberedJobs() {
  try {
    const raw = sessionStorage.getItem(ACTIVE_JOBS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function forgetActiveJob(jobId) {
  try {
    const list = listRememberedJobs().filter((row) => row.id !== jobId);
    sessionStorage.setItem(ACTIVE_JOBS_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

export async function fetchImageJob(jobId) {
  const response = await fetch(resolveApiUrl(`/api/images/jobs/${encodeURIComponent(jobId)}`), {
    credentials: 'include',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'Could not load image job');
  const progress = data.progress;
  const total = progress?.total || data.imageCount || 1;
  const completed = progress?.completed || 0;
  const percent = total > 0 ? Math.round((completed / total) * 100) : data.status === 'completed' ? 100 : null;
  return {
    id: data.jobId || jobId,
    kind: 'image',
    type: 'image-generation',
    status: data.status === 'processing' ? 'running' : data.status,
    progress: percent,
    stage: total > 1 ? `Generating image ${Math.min(completed + 1, total)} of ${total}` : 'Generating',
    stepIndex: completed ? completed + 1 : 1,
    stepTotal: total,
    indeterminate: percent == null && (data.status === 'queued' || data.status === 'processing'),
    etaLabel: percent == null && data.status === 'processing' ? 'Estimating…' : null,
    raw: data,
  };
}

export async function fetchBackgroundJob(jobId) {
  const response = await fetch(resolveApiUrl(`/api/jobs/${encodeURIComponent(jobId)}`), {
    credentials: 'include',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'Could not load job');
  return data;
}

export async function cancelBackgroundJob(jobId) {
  const response = await fetch(resolveApiUrl(`/api/jobs/${encodeURIComponent(jobId)}`), {
    method: 'DELETE',
    credentials: 'include',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'Could not cancel job');
  return data;
}

export async function cancelImageJob(jobId) {
  const response = await fetch(resolveApiUrl(`/api/images/jobs/${encodeURIComponent(jobId)}`), {
    method: 'DELETE',
    credentials: 'include',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'Could not cancel image job');
  return data;
}

export function streamJobEvents(jobId, { kind = 'background', onUpdate, onError, onDone } = {}) {
  const path = kind === 'image'
    ? `/api/images/jobs/${encodeURIComponent(jobId)}/stream`
    : `/api/jobs/${encodeURIComponent(jobId)}/stream`;
  const source = new EventSource(resolveApiUrl(path), { withCredentials: true });

  source.onmessage = (event) => {
    if (event.data === '[DONE]') {
      source.close();
      onDone?.();
      return;
    }
    try {
      const payload = JSON.parse(event.data);
      onUpdate?.(payload);
      const terminal = ['completed', 'failed', 'cancelled'];
      if (terminal.includes(String(payload.status).toLowerCase())) {
        source.close();
        onDone?.(payload);
      }
    } catch {
      /* ignore malformed */
    }
  };

  source.onerror = () => {
    source.close();
    onError?.(new Error('Job stream disconnected'));
  };

  return () => source.close();
}

export function jobHeadline(job) {
  if (!job) return 'Processing';
  if (job.kind === 'image' || job.type === 'image-generation') return 'Generating your image';
  if (job.type === 'document') return 'Processing your document';
  return `Running ${job.type || 'task'}`;
}

export function isJobActive(status) {
  const s = String(status || '').toLowerCase();
  return s === 'queued' || s === 'running' || s === 'processing';
}
