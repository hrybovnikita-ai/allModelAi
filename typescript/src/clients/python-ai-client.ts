import { readBackendServiceEnv, type ContractsEnvOptions } from '../config/env';
import { fetchJson } from '../utils/http';
import type {
  AIHealthResponse,
  PredictionRequest,
  PredictionResponse,
  TrainingProgress,
  TrainingRequest,
  TrainingResponse,
} from '../types/python-ai';
import {
  parseAiHealthResponse,
  parsePredictionResponse,
  parseTrainingProgress,
} from '../validation/schemas';

export interface PythonAiClientOptions extends ContractsEnvOptions {
  /** When set, calls go through backend proxy (/api/ai-python/*) instead of direct Python port. */
  useBackendProxy?: boolean;
}

export class PythonAiClient {
  readonly directBaseUrl: string;
  readonly backendBaseUrl: string;
  readonly useBackendProxy: boolean;

  constructor(options: PythonAiClientOptions = {}) {
    const env = readBackendServiceEnv(options);
    this.directBaseUrl = env.aiPythonBaseUrl;
    this.backendBaseUrl = env.apiBaseUrl;
    this.useBackendProxy = options.useBackendProxy ?? false;
  }

  private path(directPath: string, proxyPath: string): { baseUrl: string; path: string } {
    if (this.useBackendProxy) {
      return { baseUrl: this.backendBaseUrl, path: proxyPath };
    }
    return { baseUrl: this.directBaseUrl, path: directPath };
  }

  async health(): Promise<AIHealthResponse> {
    const { baseUrl, path } = this.path('/health', '/api/ai-python/status');
    const raw = await fetchJson<unknown>(path, { baseUrl, credentials: 'omit', timeoutMs: 5000 });
    const parsed = parseAiHealthResponse(raw);
    if (!parsed.success) {
      throw new Error(parsed.error);
    }
    return parsed.data;
  }

  async status(): Promise<TrainingProgress> {
    const { baseUrl, path } = this.path('/status', '/api/ai-python/status');
    const raw = await fetchJson<unknown>(path, { baseUrl, credentials: 'include' });
    const parsed = parseTrainingProgress(raw);
    if (!parsed.success) {
      throw new Error(parsed.error);
    }
    return parsed.data;
  }

  async train(body: TrainingRequest, credentials: RequestCredentials = 'include'): Promise<TrainingResponse> {
    const { baseUrl, path } = this.path('/train', '/api/ai-python/train');
    return fetchJson<TrainingResponse>(path, {
      baseUrl,
      method: 'POST',
      credentials,
      body: JSON.stringify(body),
    });
  }

  async predict(body: PredictionRequest, credentials: RequestCredentials = 'include'): Promise<PredictionResponse> {
    const { baseUrl, path } = this.path('/predict', '/api/ai-python/predict');
    const raw = await fetchJson<unknown>(path, {
      baseUrl,
      method: 'POST',
      credentials,
      body: JSON.stringify(body),
    });
    const parsed = parsePredictionResponse(raw);
    if (!parsed.success) {
      throw new Error(parsed.error);
    }
    return parsed.data;
  }
}
