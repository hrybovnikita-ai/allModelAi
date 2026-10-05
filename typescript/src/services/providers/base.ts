import type { ChatMessage } from '../../types/domain';

export interface TextGenerationOptions {
  messages: ChatMessage[];
  model?: string;
  variant?: string;
  stream?: boolean;
  temperature?: number;
  maxTokens?: number;
}

export interface TextGenerationResult {
  text: string;
  model?: string;
  providerId: string;
  raw?: unknown;
}

/**
 * Server-side AI provider abstraction. Implementations live in backend services;
 * this package defines the contract only (no API keys, no network I/O here).
 */
export interface AIProvider {
  readonly id: string;
  readonly name: string;
  /** Whether credentials/env for this provider are configured on the server. */
  isAvailable(): Promise<boolean>;
  generateText(options: TextGenerationOptions): Promise<TextGenerationResult>;
}

export abstract class AbstractAIProvider implements AIProvider {
  abstract readonly id: string;
  abstract readonly name: string;

  abstract isAvailable(): Promise<boolean>;

  abstract generateText(options: TextGenerationOptions): Promise<TextGenerationResult>;
}
