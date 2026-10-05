import { z } from 'zod';

export const chatMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  text: z.string().optional(),
  content: z.string().optional(),
  imageUrl: z.string().optional(),
}).passthrough();

export const chatRequestSchema = z.object({
  model: z.string().min(1),
  messages: z.array(chatMessageSchema).min(1),
  variant: z.string().optional(),
  temporary: z.boolean().optional(),
  fallbackEnabled: z.boolean().optional(),
  routerMode: z.string().optional(),
}).passthrough();

export const routingRequestSchema = z.object({
  prompt: z.string().min(1),
  routerMode: z.string().optional(),
  allowedModels: z.array(z.string()).optional(),
  userAccessMode: z.enum(['user', 'developer']).optional(),
}).passthrough();

export const routingDecisionSchema = z.object({
  model: z.string(),
  reason: z.string(),
  category: z.string().optional(),
  provider: z.string().optional(),
  fallbackOrder: z.array(z.string()).optional(),
}).passthrough();

export const apiErrorBodySchema = z.object({
  code: z.string().optional(),
  message: z.string(),
  status: z.number().optional(),
  details: z.record(z.unknown()).optional(),
});

export const aiHealthResponseSchema = z.object({
  status: z.string(),
  service: z.string().optional(),
  device: z.string().optional(),
}).passthrough();

export const trainingRequestSchema = z.object({
  epochs: z.number().int().positive().optional(),
  lr: z.number().positive().optional(),
  batch_size: z.number().int().positive().optional(),
  openai_augment: z.boolean().optional(),
  openai_samples_per_class: z.number().int().optional(),
}).passthrough();

export const trainingResponseSchema = z.object({
  message: z.string().optional(),
  epochs: z.number().optional(),
  status: z.string().optional(),
  error: z.string().optional(),
  openai_augment: z.boolean().optional(),
}).passthrough();

export const predictionRequestSchema = z.object({
  text: z.string(),
  slot: z.string().nullable().optional(),
});

export const predictionResponseSchema = z.object({
  label: z.string().optional(),
  confidence: z.number().optional(),
  probabilities: z.record(z.number()).optional(),
  error: z.string().optional(),
  ok: z.boolean().optional(),
}).passthrough();

export const trainingProgressSchema = z.object({
  status: z.string().optional(),
  is_training: z.boolean().optional(),
  device: z.string().optional(),
  current_epoch: z.number().optional(),
  total_epochs: z.number().optional(),
  progress_percent: z.number().optional(),
  last_loss: z.number().nullable().optional(),
  best_loss: z.number().nullable().optional(),
  last_accuracy: z.number().optional(),
  training_samples: z.number().optional(),
  stream_done: z.boolean().optional(),
}).passthrough();

export type ParseResult<T> = { success: true; data: T } | { success: false; error: string };

function formatZodError(error: z.ZodError): string {
  return error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
}

export function parseChatRequest(input: unknown): ParseResult<z.infer<typeof chatRequestSchema>> {
  const result = chatRequestSchema.safeParse(input);
  return result.success
    ? { success: true, data: result.data }
    : { success: false, error: formatZodError(result.error) };
}

export function parseRoutingDecision(input: unknown): ParseResult<z.infer<typeof routingDecisionSchema>> {
  const result = routingDecisionSchema.safeParse(input);
  return result.success
    ? { success: true, data: result.data }
    : { success: false, error: formatZodError(result.error) };
}

export function parseAiHealthResponse(input: unknown): ParseResult<z.infer<typeof aiHealthResponseSchema>> {
  const result = aiHealthResponseSchema.safeParse(input);
  return result.success
    ? { success: true, data: result.data }
    : { success: false, error: formatZodError(result.error) };
}

export function parseTrainingProgress(input: unknown): ParseResult<z.infer<typeof trainingProgressSchema>> {
  const result = trainingProgressSchema.safeParse(input);
  return result.success
    ? { success: true, data: result.data }
    : { success: false, error: formatZodError(result.error) };
}

export function parsePredictionResponse(input: unknown): ParseResult<z.infer<typeof predictionResponseSchema>> {
  const result = predictionResponseSchema.safeParse(input);
  return result.success
    ? { success: true, data: result.data }
    : { success: false, error: formatZodError(result.error) };
}
