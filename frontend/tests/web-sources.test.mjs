import assert from 'node:assert/strict';
import { shouldShowWebSearchCompleted, shouldShowWebSearchUnavailable } from '../src/lib/webSearchUi.js';

assert.equal(shouldShowWebSearchCompleted(true, 2), true);
assert.equal(shouldShowWebSearchCompleted(true, 0), false);
assert.equal(shouldShowWebSearchCompleted(false, 3), false);

assert.equal(shouldShowWebSearchUnavailable(true), true);
assert.equal(shouldShowWebSearchUnavailable(false), false);
