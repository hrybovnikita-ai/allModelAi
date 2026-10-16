import assert from 'node:assert/strict';
import {
  WEB_SEARCH_PROGRESS_STAGES,
  webSearchStageIndex,
  shouldShowWebSearchCompleted,
  shouldShowWebSearchUnavailable,
} from '../src/lib/webSearchUi.js';

assert.equal(WEB_SEARCH_PROGRESS_STAGES.length, 4);
assert.equal(WEB_SEARCH_PROGRESS_STAGES[0].id, 'searching');
assert.equal(WEB_SEARCH_PROGRESS_STAGES[1].id, 'finding_sources');
assert.equal(WEB_SEARCH_PROGRESS_STAGES[2].id, 'checking');
assert.equal(WEB_SEARCH_PROGRESS_STAGES[3].id, 'generating');

assert.equal(webSearchStageIndex('searching'), 0);
assert.equal(webSearchStageIndex('finding_sources'), 1);
assert.equal(webSearchStageIndex('found'), 1);
assert.equal(webSearchStageIndex('checking'), 2);
assert.equal(webSearchStageIndex('reading'), 2);
assert.equal(webSearchStageIndex('generating'), 3);
assert.equal(webSearchStageIndex('no_sources'), -1);
assert.equal(webSearchStageIndex('search_unavailable'), -1);

assert.equal(shouldShowWebSearchCompleted(true, 3), true);
assert.equal(shouldShowWebSearchCompleted(true, 0), false);
assert.equal(shouldShowWebSearchUnavailable(true), true);

console.log('web-search-progress.test.mjs ok');
