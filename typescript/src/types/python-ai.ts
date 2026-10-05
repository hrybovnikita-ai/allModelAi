/** JSON contracts for ai_python FastAPI service (HTTP). */

export interface AIHealthResponse {
  status: string;
  service?: string;
  device?: string;
}

export interface TrainingRequest {
  epochs?: number;
  lr?: number;
  batch_size?: number;
  openai_augment?: boolean;
  openai_samples_per_class?: number;
}

export interface TrainingResponse {
  message?: string;
  epochs?: number;
  status?: string;
  error?: string;
  openai_augment?: boolean;
}

export interface PredictionRequest {
  text: string;
  slot?: string | null;
}

export interface PredictionResponse {
  label?: string;
  confidence?: number;
  probabilities?: Record<string, number>;
  error?: string;
  ok?: boolean;
}

export interface ModelInfo {
  status?: string;
  is_training?: boolean;
  device?: string;
  total_parameters?: number;
  model_file_exists?: boolean;
}

export interface TrainingProgress extends ModelInfo {
  current_epoch?: number;
  total_epochs?: number;
  progress_percent?: number;
  last_loss?: number | null;
  best_loss?: number | null;
  last_accuracy?: number;
  training_samples?: number;
  stream_done?: boolean;
}

export interface TrainingMetrics {
  loss_history?: number[];
  accuracy_history?: number[];
  val_loss_history?: number[];
}
