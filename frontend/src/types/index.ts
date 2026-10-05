/**
 * Application types — re-export shared contracts for gradual TS migration.
 * Existing .jsx files can import from here without duplicating interfaces.
 */
export type {
  User,
  AuthSession,
  AIModel,
  AIModelSlug,
  AIProviderId,
  AIProviderDescriptor,
  ChatMessage,
  ChatRequest,
  ChatResponse,
  ChatResponseMeta,
  ImageGenerationRequest,
  ImageGenerationResponse,
  SubscriptionPlan,
  SubscriptionPlanId,
  PaymentStatus,
  ApiErrorBody,
} from '@allmodelai/contracts';

export type {
  RouterMode,
  RoutingRequest,
  RoutingDecision,
  RoutingCategory,
  ModelCapability,
  ModelAvailability,
} from '@allmodelai/contracts';

export { parseChatRequest, parseRoutingDecision } from '@allmodelai/contracts';
