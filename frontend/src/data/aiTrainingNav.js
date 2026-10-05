export const LESSON_ORDER = [
  'python-for-ai',
  'numpy-basics',
  'linear-regression',
  'gradient-descent',
  'loss-functions',
  'model-evaluation',
  'pytorch-intro',
];

export function nextLessonId(currentId, lessons = []) {
  const order = lessons.length
    ? [...lessons].sort((a, b) => (a.order || 0) - (b.order || 0)).map((l) => l.id)
    : LESSON_ORDER;
  const idx = order.indexOf(currentId);
  if (idx < 0 || idx >= order.length - 1) return null;
  return order[idx + 1];
}

export function trainEndpointForLesson(lesson) {
  if (!lesson) return null;
  const lab = lesson.labType || lesson.id;
  if (lab === 'linear_regression' || lesson.id === 'linear-regression') {
    return '/api/ai-training/linear-regression/train';
  }
  if (lab === 'gradient_descent' || lesson.id === 'gradient-descent') {
    return '/api/ai-training/gradient-descent/train';
  }
  if (lab === 'pytorch_linear' || lesson.id === 'pytorch-intro') {
    return '/api/ai-training/pytorch/train';
  }
  return null;
}
