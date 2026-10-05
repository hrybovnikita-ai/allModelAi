/** Core domain types shared across frontend, backend, and SDK. */

export type UserId = string;

export interface User {
  id: UserId;
  email: string;
  name: string;
  avatarUrl?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface AuthSession {
  user: User;
  expiresAt?: string;
  rememberMe?: boolean;
}

export type AIModelSlug =
  | 'smart'
  | 'gpt'
  | 'gemini'
  | 'claude'
  | 'grok'
  | 'deepseek'
  | 'llama'
  | 'mistral'
  | 'kimi'
  | 'cloudflare'
  | 'qwen'
  | 'perplexity'
  | 'copilot';

export interface AIModel {
  slug: AIModelSlug | string;
  label: string;
  provider: AIProviderId | string;
  variant?: string;
  description?: string;
}

export type AIProviderId =
  | 'openai'
  | 'gemini'
  | 'claude'
  | 'grok'
  | 'deepseek'
  | 'llama'
  | 'mistral'
  | 'kimi'
  | 'cloudflare'
  | 'openrouter'
  | 'perplexity'
  | 'copilot';

export interface AIProviderDescriptor {
  id: AIProviderId | string;
  name: string;
  /** Server-side env var names that gate availability (never values). */
  configKeyHints?: readonly string[];
}

export type ChatRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  role: ChatRole;
  text?: string;
  content?: string;
  imageUrl?: string;
}

export interface ChatRequest {
  model: AIModelSlug | string;
  messages: ChatMessage[];
  variant?: string;
  temporary?: boolean;
  fallbackEnabled?: boolean;
  routerMode?: import('./routing').RouterMode;
}

export interface ChatResponseMeta {
  model?: string;
  provider?: string;
  fallback?: boolean;
  route?: import('./routing').RoutingDecision;
}

export interface ChatResponse {
  ok: boolean;
  text?: string;
  meta?: ChatResponseMeta;
  error?: ApiErrorBody;
}

export interface ImageGenerationRequest {
  prompt: string;
  model?: string;
  aspectRatio?: string;
  quality?: string;
}

export interface ImageGenerationResponse {
  ok: boolean;
  imageUrl?: string;
  error?: ApiErrorBody;
}

export type SubscriptionPlanId = 'free' | 'pro' | 'developer' | string;

export interface SubscriptionPlan {
  id: SubscriptionPlanId;
  name: string;
  priceMonthly?: number;
  currency?: string;
}

export type PaymentStatus =
  | 'pending'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'canceled'
  | 'refunded';

export interface ApiErrorBody {
  code?: string;
  message: string;
  status?: number;
  details?: Record<string, unknown>;
}
