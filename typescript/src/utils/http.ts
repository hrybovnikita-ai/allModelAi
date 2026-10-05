import { ApiError } from '../core/errors';

export interface JsonFetchOptions extends RequestInit {
  baseUrl?: string;
  timeoutMs?: number;
}

export async function fetchJson<T>(
  path: string,
  options: JsonFetchOptions = {},
): Promise<T> {
  const base = (options.baseUrl ?? '').replace(/\/$/, '');
  const url = path.startsWith('http') ? path : `${base}${path.startsWith('/') ? path : `/${path}`}`;

  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? 30_000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: options.signal ?? controller.signal,
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    });

    const text = await response.text();
    let payload: unknown = null;
    if (text) {
      try {
        payload = JSON.parse(text) as unknown;
      } catch {
        throw new ApiError('Invalid JSON response from server', { status: response.status, code: 'invalid_json' });
      }
    }

    if (!response.ok) {
      const message =
        typeof payload === 'object'
        && payload !== null
        && 'message' in payload
        && typeof (payload as { message: unknown }).message === 'string'
          ? (payload as { message: string }).message
          : `HTTP ${response.status}`;
      throw new ApiError(message, { status: response.status, code: 'http_error', details: { payload } });
    }

    return payload as T;
  } finally {
    clearTimeout(timer);
  }
}
