import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyDeepResearchSseEvent,
  stepIndexForStage,
} from '../src/lib/deepResearchClient.js';

describe('deepResearchClient', () => {
  test('stepIndexForStage maps searching', () => {
    assert.ok(stepIndexForStage('searching') >= 2);
  });

  test('applyDeepResearchSseEvent updates source count from search events', () => {
    const next = applyDeepResearchSseEvent(
      { deepResearch: true, webSearching: true },
      { researchEvent: 'search.source_found', sourceCount: 12, deepResearchStage: 'searching' },
    );
    assert.equal(next.deepResearchProgress.sourceCount, 12);
  });

  test('research.failed sets one user-facing error without generic error field', () => {
    const next = applyDeepResearchSseEvent(
      { deepResearch: true, webSearching: true },
      {
        researchEvent: 'research.failed',
        failureCode: 'no_sources',
        message: 'No reliable sources were found for this question. Try rephrasing or a broader time range.',
      },
    );
    assert.ok(next.deepResearchError);
    assert.equal(next.webSearching, false);
  });
});
