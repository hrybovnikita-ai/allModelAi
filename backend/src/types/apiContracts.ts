/**
 * Backend-facing re-exports for gradual TypeScript migration.
 * Runtime remains JavaScript; use contractsBridge.js from .js modules.
 */
export type {
  ChatRequest,
  ChatMessage,
  RoutingDecision,
  RoutingRequest,
  TrainingProgress,
  PredictionResponse,
} from '@allmodelai/contracts';

export {
  parseChatRequest,
  parseRoutingDecision,
  parseTrainingProgress,
  parsePredictionResponse,
  parseAiHealthResponse,
} from '@allmodelai/contracts';
