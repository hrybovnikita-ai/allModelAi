import type { AIModelSlug } from './domain';

export type RouterMode = 'balanced' | 'economy' | 'quality' | string;

export type RoutingCategory =
  | 'general'
  | 'coding'
  | 'creative'
  | 'analysis'
  | 'search'
  | string;

export type RoutingReason = string;

export interface ModelCapability {
  slug: AIModelSlug | string;
  supportsStreaming?: boolean;
  supportsImages?: boolean;
  supportsTools?: boolean;
  maxContextTokens?: number;
}

export interface ModelAvailability {
  slug: AIModelSlug | string;
  configured: boolean;
  directKey?: boolean;
  viaGateway?: boolean;
}

export interface RoutingRequest {
  prompt: string;
  routerMode?: RouterMode;
  allowedModels?: readonly (AIModelSlug | string)[];
  userAccessMode?: 'user' | 'developer';
}

export interface RoutingDecision {
  model: AIModelSlug | string;
  reason: RoutingReason;
  category?: RoutingCategory;
  provider?: string;
  fallbackOrder?: readonly (AIModelSlug | string)[];
}
