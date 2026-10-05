import test from 'node:test';
import assert from 'node:assert/strict';
import { trainEndpointForLesson, nextLessonId } from '../src/data/aiTrainingNav.js';

test('trainEndpointForLesson maps lab lessons', () => {
  assert.equal(
    trainEndpointForLesson({ id: 'linear-regression', labType: 'linear_regression' }),
    '/api/ai-training/linear-regression/train',
  );
  assert.equal(
    trainEndpointForLesson({ id: 'gradient-descent' }),
    '/api/ai-training/gradient-descent/train',
  );
  assert.equal(trainEndpointForLesson({ id: 'python-for-ai' }), null);
});

test('nextLessonId follows lesson order', () => {
  const lessons = [
    { id: 'a', order: 1 },
    { id: 'b', order: 2 },
  ];
  assert.equal(nextLessonId('a', lessons), 'b');
  assert.equal(nextLessonId('b', lessons), null);
});
