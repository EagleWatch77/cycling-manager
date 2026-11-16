import assert from 'node:assert/strict';
import { stateFromWear, stateFromCondition, stateBand, overallBikeLevel, formatBikeLevel } from './overview';

assert.deepEqual([0, 30, 90, 100].map(stateFromWear), [100, 70, 10, 0]);
assert.equal(stateFromCondition(70), 70);
assert.deepEqual([100, 41, 40, 11, 10, 0].map(stateBand), ['good', 'good', 'low', 'low', 'critical', 'critical']);
assert.equal(formatBikeLevel(overallBikeLevel([1, 1, 1, 1, 1])), '1');
assert.equal(formatBikeLevel(overallBikeLevel([2, 2, 1, 1, 1])), '1,4');
assert.equal(formatBikeLevel(overallBikeLevel([2, 2, 1, 1, 1]), '.'), '1.4');
assert.equal(formatBikeLevel(overallBikeLevel([4, 4, 4, 4, 4])), '4');
assert.equal(formatBikeLevel(overallBikeLevel([1, 1, 1, 1, 2])), '1,2');
assert.equal(formatBikeLevel(overallBikeLevel([2, 1, 1, 1, 1]) ), '1,2');
// wear never changes the level: the level only depends on the levels passed in
assert.equal(overallBikeLevel([1, 1, 1, 1, 1]), 1);
console.log('overview OK');
