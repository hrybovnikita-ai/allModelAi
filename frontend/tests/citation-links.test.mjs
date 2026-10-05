import assert from 'node:assert/strict';
import {
  buildCitationSourceMap,
  isSafeHttpUrl,
  splitCitationSegments,
} from '../src/lib/citationLinks.js';

assert.equal(isSafeHttpUrl('https://example.com/a'), true);
assert.equal(isSafeHttpUrl('ftp://example.com'), false);
assert.equal(isSafeHttpUrl('javascript:alert(1)'), false);

const map = buildCitationSourceMap([
  { citationId: 2, url: 'https://example.com/doc', title: 'Doc' },
]);
assert.equal(map.get(2)?.url, 'https://example.com/doc');
assert.equal(map.has(99), false);

const segments = splitCitationSegments('Text [1] and [2][3] end');
assert.deepEqual(segments, ['Text ', '[1]', ' and ', '[2]', '[3]', ' end']);
