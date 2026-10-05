import { readBackendServiceEnv, type ContractsEnvOptions } from '../config/env';
import { fetchJson } from '../utils/http';
import type { ChatRequest } from '../types/domain';
import type { RoutingDecision, RoutingRequest } from '../types/routing';
import { parseRoutingDecision } from '../validation/schemas';

export interface BackendClientOptions extends ContractsEnvOptions {
  credentials?: RequestCredentials;
}

export class BackendApiClient {
  readonly baseUrl: string;
  readonly credentials: RequestCredentials;

  constructor(options: BackendClientOptions = {}) {
    this.baseUrl = readBackendServiceEnv(options).apiBaseUrl;
    this.credentials = options.credentials ?? 'include';
  }

  async previewRouter(body: RoutingRequest): Promise<RoutingDecision> {
    const raw = await fetchJson<unknown>('/api/router/preview', {
      baseUrl: this.baseUrl,
      method: 'POST',
      credentials: this.credentials,
      body: JSON.stringify(body),
    });
    const parsed = parseRoutingDecision(raw);
    if (!parsed.success) {
      throw new Error(parsed.error);
    }
    return parsed.data as RoutingDecision;
  }

  async postChat(body: ChatRequest): Promise<Response> {
    const url = `${this.baseUrl.replace(/\/$/, '')}/api/chat`;
    return fetch(url, {
      method: 'POST',
      credentials: this.credentials,
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream, application/json' },
      body: JSON.stringify(body),
    });
  }

  async getHealth(): Promise<{ checks?: Record<string, boolean> }> {
    return fetchJson('/api/health', { baseUrl: this.baseUrl, credentials: 'omit' });
  }
}
