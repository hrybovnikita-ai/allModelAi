import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LTX_VIDEO_DURATION_IDS,
  VIDEO_DEFAULTS,
  buildVideoRequestBody,
  clampVideoSettings,
  durationOptionsForModel,
  resolveVideoUiOptions,
} from '../src/lib/videoGenerationOptions.js';

test('LTX duration list includes 3 seconds and omits unsupported legacy-only values', () => {
  assert.ok(LTX_VIDEO_DURATION_IDS.includes(3));
  assert.ok(LTX_VIDEO_DURATION_IDS.includes(4));
  assert.ok(!LTX_VIDEO_DURATION_IDS.includes(7));
});

test('buildVideoRequestBody forwards selected duration and LTX defaults', () => {
  const body = buildVideoRequestBody({
    prompt: 'Dragon test',
    durationSeconds: 3,
    resolution: '480p',
    aspectRatio: '16:9',
  });
  assert.equal(body.durationSeconds, 3);
  assert.equal(body.resolution, '480p');
  assert.equal(body.aspectRatio, '16:9');

  const defaults = buildVideoRequestBody({ prompt: 'Defaults' });
  assert.equal(defaults.durationSeconds, VIDEO_DEFAULTS.durationSeconds);
  assert.equal(defaults.resolution, VIDEO_DEFAULTS.resolution);
});

test('resolveVideoUiOptions uses server LTX model spec when present', () => {
  const ui = resolveVideoUiOptions({
    providers: {
      magichour: {
        model: 'ltx-2.5',
        models: [{
          id: 'ltx-2.5',
          resolutions: ['480p', '720p', '1080p'],
          durationSecondsOptions: [3, 4, 5],
          defaultResolution: '480p',
          defaultDurationSeconds: 3,
        }],
      },
    },
  });
  assert.equal(ui.durations[0].id, 3);
  assert.deepEqual(ui.resolutions.map((item) => item.id), ['480p', '720p', '1080p']);
  const clamped = clampVideoSettings({ resolution: '360p', durationSeconds: 5 }, ui);
  assert.equal(clamped.resolution, '480p');
  assert.equal(clamped.durationSeconds, 5);
});

test('durationOptionsForModel falls back to LTX list without server spec', () => {
  const options = durationOptionsForModel(null);
  assert.ok(options.some((item) => item.id === 3));
});
