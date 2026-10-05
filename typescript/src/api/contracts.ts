/** HTTP path constants for cross-service documentation and clients. */

export const BACKEND_API = {
  health: '/api/health',
  chat: '/api/chat',
  routerPreview: '/api/router/preview',
  firebaseConfig: '/api/public/firebase-config',
  authFirebase: '/api/auth/firebase',
  authFirebaseChallenge: '/api/auth/firebase/challenge',
} as const;

export const BACKEND_AI_PYTHON_PROXY = {
  status: '/api/ai-python/status',
  train: '/api/ai-python/train',
  predict: '/api/ai-python/predict',
  reset: '/api/ai-python/reset',
  dataset: '/api/ai-python/dataset',
  trainStream: '/api/ai-python/train/stream',
} as const;

export const PYTHON_AI_DIRECT = {
  health: '/health',
  status: '/status',
  train: '/train',
  predict: '/predict',
  trainStream: '/train/stream',
} as const;
